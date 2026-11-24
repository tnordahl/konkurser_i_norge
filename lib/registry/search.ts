/**
 * One search box for companies (current and former names, org.nr), business
 * addresses, and archived history (names, business and postal addresses 2019–2026).
 */
import { Prisma, type PrismaClient } from "@prisma/client";

export interface CompanyHit {
  organizationNumber: string;
  name: string | null;
  formerNames: string | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  kommuneName: string | null;
  moves: number;
  bankruptcy: string | null; // eventType of the first KONKURS/TVANGSAVVIKLING, if any
}

export interface AddressHit {
  address: string;
  postalCode: string | null;
  city: string | null;
  kommuneName: string | null;
  companies: number;
  sample: { organizationNumber: string; name: string | null }[];
  bankruptCompanies: number;
}

const COMPANY_COLUMNS = Prisma.sql`
  s."organizationNumber", s.name, s."formerNames", s.address, s."postalCode", s.city, s."kommuneName",
  (SELECT COUNT(*)::int FROM address_moves m WHERE m."organizationNumber" = s."organizationNumber") AS moves,
  (SELECT b."eventType" FROM bankruptcy_events b WHERE b."organizationNumber" = s."organizationNumber"
     AND b."eventType" IN ('KONKURS', 'TVANGSAVVIKLING') ORDER BY b."eventDate" LIMIT 1) AS bankruptcy`;

export interface HistoryHit {
  organizationNumber: string;
  name: string | null;
  matchedIn: "navn" | "forretningsadresse" | "postadresse";
  matchedText: string;
  firstSeen: Date;
  lastSeen: Date;
  everBankrupt: boolean;
}

export async function search(prisma: PrismaClient, input: string) {
  const q = input.trim().replace(/\s+/g, " ");
  const digits = q.replace(/\s/g, "");
  const like = `%${q}%`;

  // A postcode in the query ("Prestegata 7 4950") narrows the address search.
  const postcode = q.match(/\b(\d{4})\b/)?.[1] ?? null;
  const street = postcode ? q.replace(postcode, "").replace(/[,\s]+$/g, "").trim() : q;
  // Match addresses from the start of a word ("adf" must not hit "Kokstadflaten").
  const streetRe = "\\m" + street.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Archived snapshots 2019–2026: historical names, business and postal (c/o) addresses.
  const nameRe = "\\m" + q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // With a postcode in the query, it must match too (business postcode, or inside the postal address text).
  const bizMatch = Prisma.sql`(p.address ~* ${streetRe} AND (${postcode}::text IS NULL OR p."postalCode" = ${postcode}::text))`;
  const postMatch = Prisma.sql`(p."postAddress" ~* ${streetRe} AND (${postcode}::text IS NULL OR p."postAddress" LIKE '%' || ${postcode}::text || '%'))`;
  const history =
    q.length >= 3 && !/^\d+$/.test(digits)
      ? prisma.$queryRaw<HistoryHit[]>(Prisma.sql`
          WITH hits AS (
            SELECT p."organizationNumber", p.name,
                   CASE WHEN p.name ~* ${nameRe} THEN 'navn'
                        WHEN ${bizMatch} THEN 'forretningsadresse'
                        ELSE 'postadresse' END AS "matchedIn",
                   CASE WHEN p.name ~* ${nameRe} THEN p.name
                        WHEN ${bizMatch} THEN concat_ws(', ', p.address, p."postalCode")
                        ELSE p."postAddress" END AS "matchedText",
                   p."firstSeen", p."lastSeen"
            FROM archived_company_periods p
            WHERE p.name ~* ${nameRe} OR ${bizMatch} OR ${postMatch}
          )
          SELECT h."organizationNumber", MAX(h.name) AS name, MIN(h."matchedIn") AS "matchedIn",
                 MAX(h."matchedText") AS "matchedText", MIN(h."firstSeen") AS "firstSeen", MAX(h."lastSeen") AS "lastSeen",
                 (EXISTS (SELECT 1 FROM archived_company_periods x WHERE x."organizationNumber" = h."organizationNumber"
                          AND (x.konkurs OR x.tvangsavvikling))
                  OR EXISTS (SELECT 1 FROM bankruptcy_events b WHERE b."organizationNumber" = h."organizationNumber"
                          AND b."eventType" IN ('KONKURS', 'TVANGSAVVIKLING'))) AS "everBankrupt"
          FROM hits h
          GROUP BY h."organizationNumber"
          ORDER BY "everBankrupt" DESC, MAX(h."lastSeen") DESC
          LIMIT 40`)
      : Promise.resolve([] as HistoryHit[]);

  const [companies, addresses, historyHits] = await Promise.all([
    /^\d{9}$/.test(digits)
      ? prisma.$queryRaw<CompanyHit[]>(Prisma.sql`
          SELECT ${COMPANY_COLUMNS} FROM registry_address_state s WHERE s."organizationNumber" = ${digits}`)
      : prisma.$queryRaw<CompanyHit[]>(Prisma.sql`
          SELECT ${COMPANY_COLUMNS} FROM registry_address_state s
          WHERE s.name ILIKE ${like} OR s."formerNames" ILIKE ${like}
          ORDER BY (s.name ILIKE ${q + "%"}) DESC, (s.name ILIKE ${like}) DESC, LENGTH(s.name)
          LIMIT 25`),
    street.length >= 3
      ? prisma.$queryRaw<AddressHit[]>(Prisma.sql`
          SELECT s.address, s."postalCode", MAX(s.city) AS city, MAX(s."kommuneName") AS "kommuneName",
                 COUNT(*)::int AS companies,
                 COUNT(*) FILTER (WHERE EXISTS (
                   SELECT 1 FROM bankruptcy_events b WHERE b."organizationNumber" = s."organizationNumber"
                     AND b."eventType" IN ('KONKURS', 'TVANGSAVVIKLING')))::int AS "bankruptCompanies",
                 (array_agg(json_build_object('organizationNumber', s."organizationNumber", 'name', s.name)
                    ORDER BY s.name))[1:8] AS sample
          FROM registry_address_state s
          WHERE s.address ~* ${streetRe}
            AND (${postcode}::text IS NULL OR s."postalCode" = ${postcode}::text)
          GROUP BY s.address, s."postalCode"
          ORDER BY companies DESC
          LIMIT 15`)
      : Promise.resolve([] as AddressHit[]),
    history,
  ]);

  return { companies, addresses, history: historyHits };
}
