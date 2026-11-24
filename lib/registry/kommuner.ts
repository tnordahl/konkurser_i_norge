import type { PrismaClient } from "@prisma/client";

export interface KommuneRef {
  kommuneNumber: string;
  kommuneName: string;
}

export type LookupResult =
  | { match: KommuneRef; matchedBy: "kommunenummer" | "postnummer" | "navn"; candidates?: undefined }
  | { match: null; matchedBy?: undefined; candidates: KommuneRef[] };

let cache: { at: number; list: KommuneRef[] } | null = null;

/** All kommuner seen in the registry data (from current business addresses). Cached for an hour. */
export async function listKommuner(prisma: PrismaClient): Promise<KommuneRef[]> {
  if (cache && Date.now() - cache.at < 60 * 60 * 1000) return cache.list;
  const rows = await prisma.$queryRaw<{ kommuneNumber: string; kommuneName: string; n: bigint }[]>`
    SELECT "kommuneNumber", "kommuneName", COUNT(*) AS n
    FROM registry_address_state
    WHERE "kommuneNumber" IS NOT NULL AND "kommuneName" IS NOT NULL
    GROUP BY 1, 2
  `;
  // A number can carry several spellings over time; keep the most common.
  const best = new Map<string, { name: string; n: bigint }>();
  for (const r of rows) {
    const cur = best.get(r.kommuneNumber);
    if (!cur || r.n > cur.n) best.set(r.kommuneNumber, { name: r.kommuneName, n: r.n });
  }
  const list = Array.from(best, ([kommuneNumber, v]) => ({ kommuneNumber, kommuneName: v.name })).sort((a, b) =>
    a.kommuneName.localeCompare(b.kommuneName, "nb")
  );
  cache = { at: Date.now(), list };
  return list;
}

/**
 * Resolve what a user typed into a kommune: a 4-digit kommunenummer, a
 * 4-digit postnummer (mapped to the kommune most addresses with that postcode
 * belong to), or a (partial) kommune name.
 */
export async function lookupKommune(prisma: PrismaClient, input: string): Promise<LookupResult> {
  const q = input.trim();
  const list = await listKommuner(prisma);

  if (/^\d{4}$/.test(q)) {
    const byNumber = list.find((k) => k.kommuneNumber === q);
    if (byNumber) return { match: byNumber, matchedBy: "kommunenummer" };
    const rows = await prisma.$queryRaw<{ kommuneNumber: string; n: bigint }[]>`
      SELECT "kommuneNumber", COUNT(*) AS n FROM registry_address_state
      WHERE "postalCode" = ${q} AND "kommuneNumber" IS NOT NULL
      GROUP BY 1 ORDER BY n DESC LIMIT 1
    `;
    const k = rows[0] && list.find((x) => x.kommuneNumber === rows[0].kommuneNumber);
    return k ? { match: k, matchedBy: "postnummer" } : { match: null, candidates: [] };
  }

  const needle = q.toLocaleUpperCase("nb");
  const exact = list.filter((k) => k.kommuneName.toLocaleUpperCase("nb") === needle);
  if (exact.length === 1) return { match: exact[0], matchedBy: "navn" };
  const prefix = list.filter((k) => k.kommuneName.toLocaleUpperCase("nb").startsWith(needle));
  if (prefix.length === 1) return { match: prefix[0], matchedBy: "navn" };
  const partial = list.filter((k) => k.kommuneName.toLocaleUpperCase("nb").includes(needle));
  if (partial.length === 1) return { match: partial[0], matchedBy: "navn" };
  const candidates = exact.length ? exact : prefix.length ? [...prefix, ...partial.filter((k) => !prefix.includes(k))] : partial;
  return { match: null, candidates: candidates.slice(0, 10) };
}
