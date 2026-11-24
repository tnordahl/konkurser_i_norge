import { Prisma, type PrismaClient } from "@prisma/client";
import { calendarDaysBetween } from "./queries";
import { joinLines } from "./parse";
import type { BrregAddress } from "./types";

interface BrregEntity {
  organisasjonsnummer: string;
  navn?: string;
  organisasjonsform?: { kode?: string; beskrivelse?: string };
  registreringsdatoEnhetsregisteret?: string;
  slettedato?: string;
  konkurs?: boolean;
  konkursdato?: string;
  underAvvikling?: boolean;
  underTvangsavviklingEllerTvangsopplosning?: boolean;
  naeringskode1?: { beskrivelse?: string };
  forretningsadresse?: BrregAddress;
  postadresse?: BrregAddress;
  historiskeNavn?: { navn?: string; fraDato?: string; tilDato?: string }[];
}

const fmtAddress = (a?: BrregAddress) =>
  a ? [joinLines(a.adresse ?? []), [a.postnummer, a.poststed].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null : null;

/** Everything we know about one company: live Brreg data plus recorded moves and bankruptcy events. */
export async function getCompany(prisma: PrismaClient, orgnr: string) {
  const [state, moves, events, live, archived] = await Promise.all([
    prisma.registryAddressState.findUnique({ where: { organizationNumber: orgnr } }),
    prisma.addressMove.findMany({ where: { organizationNumber: orgnr }, orderBy: { changedAt: "asc" } }),
    prisma.bankruptcyEvent.findMany({ where: { organizationNumber: orgnr }, orderBy: { eventDate: "asc" } }),
    fetch(`https://data.brreg.no/enhetsregisteret/api/enheter/${orgnr}`, { headers: { Accept: "application/json" } })
      .then((r) => (r.ok ? (r.json() as Promise<BrregEntity>) : null))
      .catch(() => null),
    prisma.archivedCompanyPeriod.findMany({
      where: { organizationNumber: orgnr },
      orderBy: { firstSeen: "asc" },
    }),
  ]);
  if (!state && !moves.length && !events.length && !live && !archived.length) return null;

  const firstBankruptcy = events.find((e) => e.eventType === "KONKURS" || e.eventType === "TVANGSAVVIKLING") ?? null;
  return {
    company: {
      organizationNumber: orgnr,
      name: live?.navn ?? state?.name ?? moves.at(-1)?.companyName ?? events[0]?.companyName ?? archived.at(-1)?.name ?? null,
      formerNames: (live?.historiskeNavn ?? []).map((h) => ({
        name: h.navn ?? "",
        to: h.tilDato?.slice(0, 10) ?? null,
      })),
      form: live?.organisasjonsform?.beskrivelse ?? null,
      industry: live?.naeringskode1?.beskrivelse ?? null,
      registered: live?.registreringsdatoEnhetsregisteret ?? null,
      deleted: live?.slettedato ?? null,
      businessAddress: fmtAddress(live?.forretningsadresse) ?? state?.address ?? null,
      kommune: live?.forretningsadresse?.kommune ?? state?.kommuneName ?? null,
      kommuneNumber: live?.forretningsadresse?.kommunenummer ?? state?.kommuneNumber ?? null,
      postalAddress: fmtAddress(live?.postadresse),
      status: {
        konkurs: !!live?.konkurs,
        konkursdato: live?.konkursdato ?? null,
        tvangsavvikling: !!live?.underTvangsavviklingEllerTvangsopplosning,
        avvikling: !!live?.underAvvikling,
      },
      liveDataAvailable: !!live,
    },
    events: events.map((e) => ({ eventType: e.eventType, eventDate: e.eventDate, registeredAt: e.registeredAt })),
    /** Registered data per stretch of archived snapshots (2019–2026); changes are dated to an interval. */
    archived: archived.map((a) => ({
      firstSeen: a.firstSeen,
      lastSeen: a.lastSeen,
      nextSeen: a.nextSeen,
      goneAfter: a.goneAfter,
      name: a.name,
      address: [a.address, [a.postalCode, a.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null,
      kommuneName: a.kommuneName,
      postAddress: a.postAddress,
      konkurs: a.konkurs,
      konkursdato: a.konkursdato,
      underAvvikling: a.underAvvikling,
      tvangsavvikling: a.tvangsavvikling,
    })),
    moves: moves.map((m) => ({
      changedAt: m.changedAt,
      moveType: m.moveType,
      fromAddress: [m.fromAddress, [m.fromPostalCode, m.fromCity].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null,
      fromKommuneName: m.fromKommuneName,
      toAddress: [m.toAddress, [m.toPostalCode, m.toCity].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null,
      toKommuneName: m.toKommuneName,
      daysBeforeBankruptcy:
        firstBankruptcy && m.changedAt < firstBankruptcy.eventDate
          ? calendarDaysBetween(m.changedAt, firstBankruptcy.eventDate)
          : null,
    })),
  };
}

export interface CoMover {
  organizationNumber: string;
  name: string | null;
  changedAt: Date;
  daysApart: number;
  sameFrom: boolean;
  sameTo: boolean;
  from: string | null;
  to: string | null;
  bankrupt: boolean;
}

export interface CoLocated {
  organizationNumber: string;
  name: string | null;
  address: string;
  overlapFrom: Date;
  overlapTo: Date;
  bankrupt: boolean;
  deleted: boolean;
}

/**
 * Connections that don't need role data:
 * - coMovers: companies that left the same address (or moved between the same
 *   postcodes) within 30 days of one of this company's moves
 * - coLocated: companies registered at the same business address in an
 *   overlapping period of the archived snapshots (2019–2026), plus now
 * Large shared addresses (business centres) are reported with their size so
 * the UI can flag them as weak signals.
 */
export async function getAddressConnections(prisma: PrismaClient, orgnr: string) {
  const bankruptExpr = Prisma.sql`(
    EXISTS (SELECT 1 FROM bankruptcy_events b WHERE b."organizationNumber" = x.org AND b."eventType" IN ('KONKURS','TVANGSAVVIKLING'))
    OR EXISTS (SELECT 1 FROM archived_company_periods a WHERE a."organizationNumber" = x.org AND (a.konkurs OR a.tvangsavvikling)))`;

  const [coMovers, coLocated, sharedTotal] = await Promise.all([
    prisma.$queryRaw<CoMover[]>(Prisma.sql`
      SELECT x.org AS "organizationNumber", x.name, x."changedAt", x."daysApart", x."sameFrom", x."sameTo", x."from", x."to",
             ${bankruptExpr} AS bankrupt
      FROM (
        SELECT DISTINCT ON (o."organizationNumber")
               o."organizationNumber" AS org,
               COALESCE(o."companyName", s.name) AS name,
               o."changedAt",
               ABS(o."changedAt"::date - m."changedAt"::date) AS "daysApart",
               (o."fromAddress" = m."fromAddress" AND o."fromPostalCode" = m."fromPostalCode") AS "sameFrom",
               ((o."toAddress" = m."toAddress" AND o."toPostalCode" = m."toPostalCode")
                 OR (o."toPostalCode" = m."toPostalCode" AND o."fromPostalCode" = m."fromPostalCode" AND o."toPostalCode" <> o."fromPostalCode")) AS "sameTo",
               concat_ws(', ', o."fromAddress", o."fromPostalCode", o."fromCity") AS "from",
               concat_ws(', ', o."toAddress", o."toPostalCode", o."toCity") AS "to"
        FROM address_moves m
        JOIN address_moves o
          ON o."organizationNumber" <> m."organizationNumber"
         AND ABS(o."changedAt"::date - m."changedAt"::date) <= 30
         AND ((o."fromAddress" = m."fromAddress" AND o."fromPostalCode" = m."fromPostalCode")
              OR (o."toAddress" = m."toAddress" AND o."toPostalCode" = m."toPostalCode")
              OR (o."toPostalCode" = m."toPostalCode" AND o."fromPostalCode" = m."fromPostalCode" AND o."toPostalCode" <> o."fromPostalCode"))
        LEFT JOIN registry_address_state s ON s."organizationNumber" = o."organizationNumber"
        WHERE m."organizationNumber" = ${orgnr}
        ORDER BY o."organizationNumber", ABS(o."changedAt"::date - m."changedAt"::date)
      ) x
      ORDER BY x."daysApart", x.name
      LIMIT 30`),
    prisma.$queryRaw<CoLocated[]>(Prisma.sql`
      WITH mine AS (
        SELECT address, "postalCode", "firstSeen", "lastSeen"
        FROM archived_company_periods WHERE "organizationNumber" = ${orgnr} AND address IS NOT NULL
      )
      SELECT x.org AS "organizationNumber", x.name, x.address, x."overlapFrom", x."overlapTo", ${bankruptExpr} AS bankrupt, x.deleted
      FROM (
        SELECT p."organizationNumber" AS org, MAX(p.name) AS name,
               MAX(concat_ws(', ', p.address, p."postalCode", p.city)) AS address,
               MIN(GREATEST(p."firstSeen", m."firstSeen")) AS "overlapFrom",
               MAX(LEAST(p."lastSeen", m."lastSeen")) AS "overlapTo",
               bool_or(p."goneAfter") AS deleted
        FROM archived_company_periods p
        JOIN mine m ON p."postalCode" = m."postalCode" AND p.address = m.address
                   AND p."firstSeen" <= m."lastSeen" AND p."lastSeen" >= m."firstSeen"
        WHERE p."organizationNumber" <> ${orgnr}
        GROUP BY p."organizationNumber"
      ) x
      ORDER BY bankrupt DESC, x.deleted DESC, x.name
      LIMIT 40`),
    prisma.$queryRaw<{ n: number }[]>(Prisma.sql`
      WITH mine AS (
        SELECT address, "postalCode", "firstSeen", "lastSeen"
        FROM archived_company_periods WHERE "organizationNumber" = ${orgnr} AND address IS NOT NULL
      )
      SELECT COUNT(DISTINCT p."organizationNumber")::int AS n
      FROM archived_company_periods p
      JOIN mine m ON p."postalCode" = m."postalCode" AND p.address = m.address
                 AND p."firstSeen" <= m."lastSeen" AND p."lastSeen" >= m."firstSeen"
      WHERE p."organizationNumber" <> ${orgnr}`),
  ]);
  return { coMovers, coLocated, coLocatedTotal: sharedTotal[0]?.n ?? 0 };
}
