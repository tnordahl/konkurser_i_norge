import { Prisma, type PrismaClient } from "@prisma/client";

export interface KommuneOverviewRow {
  kommuneNumber: string;
  kommuneName: string;
  companies: number;
  movesIn: number;
  movesOut: number;
  movesWithin: number;
  bankruptcies: number;
  bankruptMovers: number;
}

const cache = new Map<string, { at: number; rows: KommuneOverviewRow[] }>();

/**
 * Per-kommune key figures from the registry pipeline, for moves and
 * bankruptcies registered on/after `since`:
 * - companies: organisations whose current business address is in the kommune
 * - movesIn / movesOut: cross-kommune moves (out only where the origin is known)
 * - movesWithin: new street address or postcode inside the kommune
 * - bankruptcies: konkurs/tvangsavvikling, placed in the kommune the company
 *   was registered in *at the bankruptcy* (later trustee address changes ignored)
 * - bankruptMovers: konkurs companies that moved into/out of/within the kommune
 *   in the 365 days before the bankruptcy date
 * Cached for 10 minutes.
 */
export async function kommuneOverview(prisma: PrismaClient, since: Date): Promise<KommuneOverviewRow[]> {
  const key = since.toISOString().slice(0, 10);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.rows;

  const rows = await prisma.$queryRaw<KommuneOverviewRow[]>(Prisma.sql`
    WITH m AS (SELECT * FROM address_moves WHERE "changedAt" >= ${since}),
    inn AS (SELECT "toKommuneNumber" AS k, COUNT(*)::int AS n FROM m
            WHERE "moveType" = 'CROSS_KOMMUNE' AND "toKommuneNumber" IS NOT NULL GROUP BY 1),
    ut AS (SELECT "fromKommuneNumber" AS k, COUNT(*)::int AS n FROM m
           WHERE "moveType" = 'CROSS_KOMMUNE' AND "fromKommuneNumber" IS NOT NULL GROUP BY 1),
    wi AS (SELECT "toKommuneNumber" AS k, COUNT(*)::int AS n FROM m
           WHERE "moveType" IN ('NEW_POSTCODE', 'SAME_POSTCODE') AND "toKommuneNumber" IS NOT NULL GROUP BY 1),
    bev AS (
      SELECT DISTINCT ON (b."organizationNumber") b."organizationNumber", b."eventDate"
      FROM bankruptcy_events b
      WHERE b."eventType" IN ('KONKURS', 'TVANGSAVVIKLING') AND b."eventDate" >= ${since}
      ORDER BY b."organizationNumber", b."eventDate"
    ),
    bk_place AS (
      -- Kommune at the bankruptcy: destination of the last move before it, else the
      -- current address if it has not changed since (no move after the bankruptcy).
      SELECT bev."organizationNumber",
             COALESCE(
               (SELECT mm."toKommuneNumber" FROM address_moves mm
                 WHERE mm."organizationNumber" = bev."organizationNumber" AND mm."changedAt" < bev."eventDate"
                 ORDER BY mm."changedAt" DESC LIMIT 1),
               CASE WHEN NOT EXISTS (SELECT 1 FROM address_moves mm
                                      WHERE mm."organizationNumber" = bev."organizationNumber"
                                        AND mm."changedAt" >= bev."eventDate")
                    THEN s."kommuneNumber" END
             ) AS k
      FROM bev LEFT JOIN registry_address_state s ON s."organizationNumber" = bev."organizationNumber"
    ),
    bk AS (SELECT k, COUNT(*)::int AS n FROM bk_place WHERE k IS NOT NULL GROUP BY 1),
    bm AS (
      SELECT k, COUNT(DISTINCT org)::int AS n FROM (
        SELECT b."organizationNumber" AS org, unnest(ARRAY[mm."toKommuneNumber", mm."fromKommuneNumber"]) AS k
        FROM bankruptcy_events b
        JOIN address_moves mm ON mm."organizationNumber" = b."organizationNumber"
        WHERE b."eventType" = 'KONKURS' AND b."eventDate" >= ${since}
          AND mm."changedAt" < b."eventDate" AND mm."changedAt" >= b."eventDate" - INTERVAL '365 days'
      ) x WHERE k IS NOT NULL GROUP BY k
    ),
    co AS (
      SELECT "kommuneNumber" AS k, COUNT(*)::int AS n,
             (array_agg("kommuneName" ORDER BY "asOf" DESC))[1] AS name
      FROM registry_address_state WHERE "kommuneNumber" IS NOT NULL GROUP BY 1
    )
    SELECT co.k AS "kommuneNumber", co.name AS "kommuneName", co.n AS companies,
           COALESCE(inn.n, 0) AS "movesIn", COALESCE(ut.n, 0) AS "movesOut", COALESCE(wi.n, 0) AS "movesWithin",
           COALESCE(bk.n, 0) AS bankruptcies, COALESCE(bm.n, 0) AS "bankruptMovers"
    FROM co
    LEFT JOIN inn ON inn.k = co.k LEFT JOIN ut ON ut.k = co.k LEFT JOIN wi ON wi.k = co.k
    LEFT JOIN bk ON bk.k = co.k LEFT JOIN bm ON bm.k = co.k
    -- Norwegian kommuner only (4 digits; foreign addresses have no kommune number)
    WHERE co.k ~ '^[0-9]{4}$' AND co.n >= 10
    ORDER BY co.name
  `);
  cache.set(key, { at: Date.now(), rows });
  return rows;
}

/** Distinct konkurs companies (nationwide) that changed address in the 365 days before the bankruptcy. */
export async function bankruptMoversNationwide(prisma: PrismaClient, since: Date): Promise<number> {
  const [r] = await prisma.$queryRaw<{ n: number }[]>(Prisma.sql`
    SELECT COUNT(DISTINCT b."organizationNumber")::int AS n
    FROM bankruptcy_events b JOIN address_moves m ON m."organizationNumber" = b."organizationNumber"
    WHERE b."eventType" = 'KONKURS' AND b."eventDate" >= ${since}
      AND m."changedAt" < b."eventDate" AND m."changedAt" >= b."eventDate" - INTERVAL '365 days'`);
  return r?.n ?? 0;
}
