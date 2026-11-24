import { Readable } from "node:stream";
import { createGunzip } from "node:zlib";
import { Prisma, type PrismaClient } from "@prisma/client";
import { addressFromBrreg } from "./parse";
import type { RegistryEntity } from "./types";

const SNAPSHOT_URL = "https://data.brreg.no/enhetsregisteret/api/enheter/lastned";
const DAY = 24 * 60 * 60 * 1000;

export interface SnapshotResult {
  snapshotAt: string;
  entities: number;
  inserted: number;
  filled: number;
}

/**
 * Seed `registry_address_state` from Brreg's full nightly register snapshot
 * (enheter/lastned, ~211 MB gzipped JSON), streamed — never held in memory or
 * written to disk.
 *
 * Purpose: give every organisation a known business address, so its *next*
 * move in the feed has a real origin ("from"). It does not change moves that
 * were already recorded.
 *
 * Safety rules (no stale data may overwrite newer feed data):
 * - The feed cursor must be at or past the snapshot time, so every change after
 *   the snapshot is already in our state.
 * - Organisations without state get the snapshot address (source SNAPSHOT).
 * - Existing state only gets NULL fields filled, and only when its last feed
 *   address change is at least a day older than the snapshot and every field
 *   it already knows agrees with the snapshot.
 */
export async function importSnapshot(
  prisma: PrismaClient,
  opts: { log?: (m: string) => void; batchSize?: number } = {}
): Promise<SnapshotResult> {
  const log = opts.log ?? (() => {});
  const batchSize = opts.batchSize ?? 5000;

  // Brreg answers 406 to most explicit Accept values; */* returns the gzip file.
  const res = await fetch(SNAPSHOT_URL, { headers: { Accept: "*/*", "User-Agent": "konkurser-i-norge/1.0" } });
  if (!res.ok || !res.body) throw new Error(`Snapshot download failed: HTTP ${res.status}`);
  const lastModified = res.headers.get("last-modified");
  const snapshotAt = parseBrregTimestamp(lastModified);
  if (!snapshotAt) {
    await res.body.cancel();
    throw new Error(`Snapshot has no usable Last-Modified header (${lastModified})`);
  }

  const cursor = await prisma.registryFeedCursor.findUnique({ where: { feed: "enheter" } });
  if (!cursor || cursor.lastUpdateAt < snapshotAt) {
    await res.body.cancel();
    throw new Error(
      `Feed cursor (${cursor?.lastUpdateAt.toISOString() ?? "none"}) is older than the snapshot ` +
        `(${snapshotAt.toISOString()}). Run scripts/registry-sync.ts first.`
    );
  }
  const fillBefore = new Date(snapshotAt.getTime() - DAY);
  log(`snapshot generated ${snapshotAt.toISOString()}; streaming…`);

  let batch: RegistryEntity[] = [];
  const result: SnapshotResult = { snapshotAt: snapshotAt.toISOString(), entities: 0, inserted: 0, filled: 0 };

  const flush = async () => {
    if (!batch.length) return;
    const r = await writeBatch(prisma, batch, snapshotAt, fillBefore);
    result.inserted += r.inserted;
    result.filled += r.filled;
    batch = [];
  };

  const body = Readable.fromWeb(res.body as import("node:stream/web").ReadableStream<Uint8Array>);
  for await (const entity of jsonArrayObjects(body.pipe(createGunzip()))) {
    batch.push(entity as RegistryEntity);
    result.entities++;
    if (batch.length >= batchSize) {
      await flush();
      if (result.entities % 100_000 === 0) log(`${result.entities.toLocaleString()} entities…`);
    }
  }
  await flush();
  log(`done: ${JSON.stringify(result)}`);
  return result;
}

async function writeBatch(prisma: PrismaClient, batch: RegistryEntity[], snapshotAt: Date, fillBefore: Date) {
  const orgs: string[] = [];
  const names: (string | null)[] = [];
  const former: (string | null)[] = [];
  const lines: string[] = [];
  const addr: (string | null)[] = [];
  const post: (string | null)[] = [];
  const city: (string | null)[] = [];
  const kNum: (string | null)[] = [];
  const kName: (string | null)[] = [];
  for (const e of batch) {
    const a = addressFromBrreg(e.forretningsadresse);
    orgs.push(e.organisasjonsnummer);
    names.push(e.navn ?? null);
    const fn = (e.historiskeNavn ?? []).map((h) => h.navn).filter(Boolean);
    former.push(fn.length ? fn.join(" | ") : null);
    lines.push(JSON.stringify(e.forretningsadresse?.adresse ?? []));
    addr.push(a.address);
    post.push(a.postalCode);
    city.push(a.city);
    kNum.push(a.kommuneNumber);
    kName.push(a.kommuneName);
  }

  // xmax = 0 only for freshly inserted rows; lets us count inserts vs fills.
  // Address fields are only filled (never overwritten) and only under the safety
  // conditions; former names are registry metadata and are always refreshed.
  const safe = Prisma.sql`(s."lastAddressAt" IS NULL OR s."lastAddressAt" <= ${fillBefore})
      AND (s."kommuneChangedAt" IS NULL OR s."kommuneChangedAt" <= ${fillBefore})
      AND (s."postalCode" IS NULL OR s."postalCode" IS NOT DISTINCT FROM EXCLUDED."postalCode")
      AND (s."kommuneNumber" IS NULL OR s."kommuneNumber" IS NOT DISTINCT FROM EXCLUDED."kommuneNumber")
      AND (s.address IS NULL OR s.address IS NOT DISTINCT FROM EXCLUDED.address)`;
  const fill = (col: string) =>
    Prisma.sql`CASE WHEN ${safe} THEN COALESCE(s.${Prisma.raw(col)}, EXCLUDED.${Prisma.raw(col)}) ELSE s.${Prisma.raw(col)} END`;
  // xmax = 0 only for freshly inserted rows; lets us count inserts vs updates.
  const rows = await prisma.$queryRaw<{ inserted: boolean }[]>(Prisma.sql`
    INSERT INTO registry_address_state AS s
      ("organizationNumber", name, "formerNames", "addressLines", address, "postalCode", city,
       "kommuneNumber", "kommuneName", "asOf", source)
    SELECT o, n, f, l::jsonb, a, p, c, kn, kname, ${snapshotAt}, 'SNAPSHOT'
    FROM unnest(${orgs}::text[], ${names}::text[], ${former}::text[], ${lines}::text[], ${addr}::text[],
                ${post}::text[], ${city}::text[], ${kNum}::text[], ${kName}::text[])
         AS t(o, n, f, l, a, p, c, kn, kname)
    ON CONFLICT ("organizationNumber") DO UPDATE SET
      name            = COALESCE(s.name, EXCLUDED.name),
      "formerNames"   = EXCLUDED."formerNames",
      "addressLines"  = ${fill('"addressLines"')},
      address         = ${fill("address")},
      "postalCode"    = ${fill('"postalCode"')},
      city            = ${fill("city")},
      "kommuneNumber" = ${fill('"kommuneNumber"')},
      "kommuneName"   = ${fill('"kommuneName"')}
    RETURNING (xmax = 0) AS inserted
  `);
  const inserted = rows.filter((r) => r.inserted).length;
  return { inserted, filled: rows.length - inserted }; // "filled" = existing rows touched (names refreshed, gaps filled if safe)
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ZONES: Record<string, number> = { UTC: 0, GMT: 0, CET: 1, CEST: 2 };

/**
 * Brreg sends Last-Modified as "Tue Nov 24 04:28:06 CET 2026" (Java's
 * Date.toString), which is not a valid HTTP date. Parse it explicitly; also
 * accept a proper RFC 7231 date.
 */
export function parseBrregTimestamp(v: string | null): Date | null {
  if (!v) return null;
  const m = v.match(/^\w{3} (\w{3}) (\d{1,2}) (\d{2}):(\d{2}):(\d{2}) (\w+) (\d{4})$/);
  if (m) {
    const [, mon, day, hh, mm, ss, zone, year] = m;
    const month = MONTHS.indexOf(mon);
    if (month < 0 || !(zone in ZONES)) return null;
    return new Date(Date.UTC(+year, month, +day, +hh - ZONES[zone], +mm, +ss));
  }
  const d = new Date(v);
  return /GMT|UTC|[+-]\d{4}$/.test(v) && !Number.isNaN(d.getTime()) ? d : null;
}

/**
 * Yield each top-level object of a streamed JSON array (`[ {...}, {...} ]`)
 * without loading the whole document.
 */
export async function* jsonArrayObjects(stream: AsyncIterable<Buffer | string>): AsyncGenerator<unknown> {
  const decoder = new TextDecoder("utf-8");
  let depth = 0;
  let inString = false;
  let escaped = false;
  let buf = "";
  let start = -1;

  for await (const chunk of stream) {
    const text = typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });
    const offset = buf.length;
    buf += text;
    for (let i = offset; i < buf.length; i++) {
      const ch = buf.charCodeAt(i);
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === 92 /* \ */) escaped = true;
        else if (ch === 34 /* " */) inString = false;
        continue;
      }
      if (ch === 34) inString = true;
      else if (ch === 123 /* { */) {
        if (depth === 1) start = i;
        depth++;
      } else if (ch === 125 /* } */) {
        depth--;
        if (depth === 1 && start >= 0) {
          yield JSON.parse(buf.slice(start, i + 1));
          start = -1;
        }
      } else if (ch === 91 /* [ */) depth++;
      else if (ch === 93 /* ] */) depth--;
    }
    // Keep only the unfinished object (if any).
    if (start >= 0) {
      buf = buf.slice(start);
      start = 0;
    } else {
      buf = "";
    }
  }
}
