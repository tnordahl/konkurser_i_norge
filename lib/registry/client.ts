import type { FeedUpdate, RegistryEntity } from "./types";

const BASE = "https://data.brreg.no/enhetsregisteret/api";
const HEADERS = { Accept: "application/json", "User-Agent": "konkurser-i-norge/1.0" };

/** Change details (endringer) start appearing in the feed between 2025-08-15 and 2025-09-01. */
export const FEED_DETAILS_START = "2025-08-15T00:00:00.000Z";

async function getJson<T>(url: string, attempts = 4): Promise<T | null> {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, { headers: HEADERS });
      if (res.status === 404 || res.status === 410) return null;
      if (res.ok) return (await res.json()) as T;
      if (res.status < 500 && res.status !== 429) {
        throw new Error(`Brreg ${res.status} for ${url}`);
      }
      if (i >= attempts) throw new Error(`Brreg ${res.status} after ${attempts} attempts`);
    } catch (err) {
      if (i >= attempts) throw err;
    }
    await new Promise((r) => setTimeout(r, 500 * 2 ** i));
  }
}

/**
 * One page of the update feed, oldest first.
 * Pass `fromId` (cursor, inclusive) or `fromDate` for the very first page.
 * Brreg rejects deep `page=` paging, so always advance with the id cursor.
 */
export async function fetchFeedPage(opts: {
  fromId?: number;
  fromDate?: string;
  size: number;
}): Promise<FeedUpdate[]> {
  const q = new URLSearchParams({ size: String(opts.size), includeChanges: "true" });
  if (opts.fromId !== undefined) q.set("oppdateringsid", String(opts.fromId));
  else q.set("dato", opts.fromDate ?? FEED_DETAILS_START);
  const data = await getJson<{ _embedded?: { oppdaterteEnheter?: FeedUpdate[] } }>(
    `${BASE}/oppdateringer/enheter?${q}`
  );
  const updates = data?._embedded?.oppdaterteEnheter ?? [];
  return updates.sort((a, b) => a.oppdateringsid - b.oppdateringsid);
}

/**
 * Current registry data for many organisations. The search endpoint accepts
 * 200 numbers per call but leaves out deleted entities. Those are fetched one
 * by one only when listed in `singlesFor` (up to `maxSingles` per call); for
 * everyone else the batch answer is final.
 */
export async function lookupEntities(
  orgNumbers: string[],
  opts: { singlesFor?: Set<string>; maxSingles?: number } = {}
): Promise<{ found: Map<string, RegistryEntity>; attempted: Set<string> }> {
  const maxSingles = opts.maxSingles ?? 100;
  const singlesFor = opts.singlesFor ?? new Set<string>();
  const found = new Map<string, RegistryEntity>();
  const unique = Array.from(new Set(orgNumbers));
  const attempted = new Set<string>();

  for (let i = 0; i < unique.length; i += 200) {
    const chunk = unique.slice(i, i + 200);
    const data = await getJson<{ _embedded?: { enheter?: RegistryEntity[] } }>(
      `${BASE}/enheter?organisasjonsnummer=${chunk.join(",")}&size=200`
    );
    for (const e of data?._embedded?.enheter ?? []) found.set(e.organisasjonsnummer, e);
  }

  const missing = unique.filter((n) => !found.has(n));
  const singles = new Set(missing.filter((n) => singlesFor.has(n)).slice(0, maxSingles));
  for (const n of Array.from(singles)) {
    const e = await getJson<RegistryEntity>(`${BASE}/enheter/${n}`);
    if (e?.organisasjonsnummer) found.set(n, e);
  }
  // "attempted" = we have our final answer for this org in this run
  for (const n of unique) {
    if (found.has(n) || singles.has(n) || !singlesFor.has(n)) attempted.add(n);
  }
  return { found, attempted };
}
