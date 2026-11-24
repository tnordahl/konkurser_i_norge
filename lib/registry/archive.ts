/**
 * History from archived copies of Brreg's full company file.
 *
 * The Internet Archive holds full snapshots of
 * https://data.brreg.no/enhetsregisteret/api/enheter/lastned (NLOD licence)
 * from 2019 onwards. Importing them in date order and recording when each
 * company's registered data changed gives real address/name/bankruptcy
 * history, dated to the interval between two snapshots.
 */
import { Readable } from "node:stream";
import { createGunzip } from "node:zlib";
import { Prisma, type PrismaClient } from "@prisma/client";
import { jsonArrayObjects } from "./snapshot";
import { addressFromBrreg, joinLines } from "./parse";
import type { BrregAddress } from "./types";

const SOURCE = "https://data.brreg.no/enhetsregisteret/api/enheter/lastned";

/** Complete captures only (the 2021-09-22 and 2022-06-22 captures are partial). */
export const ARCHIVED_SNAPSHOTS = [
  "20190910205422",
  "20200614193126",
  "20210427231832",
  "20210902210431",
  "20211020172548",
  "20230406035856",
  "20250824173916",
  "20251208181039",
  "20260202051133",
];

export const archiveUrl = (ts: string, source = SOURCE) => `https://web.archive.org/web/${ts}id_/${source}`;
export const tsToDate = (ts: string) =>
  new Date(`${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}T${ts.slice(8, 10) || "00"}:${ts.slice(10, 12) || "00"}:00Z`);

interface ArchivedEntity {
  organisasjonsnummer: string;
  navn?: string;
  organisasjonsform?: { kode?: string };
  forretningsadresse?: BrregAddress;
  postadresse?: BrregAddress;
  konkurs?: boolean;
  konkursdato?: string;
  underAvvikling?: boolean;
  underTvangsavviklingEllerTvangsopplosning?: boolean;
}

interface OpenPeriod {
  values: Omit<Prisma.ArchivedCompanyPeriodCreateManyInput, "firstSeen" | "lastSeen" | "nextSeen" | "goneAfter">;
  key: string;
  firstSeen: Date;
  lastSeen: Date;
}

function toValues(e: ArchivedEntity): OpenPeriod["values"] {
  const a = addressFromBrreg(e.forretningsadresse);
  const p = e.postadresse;
  const post = p
    ? [joinLines(p.adresse ?? []), [p.postnummer, p.poststed].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null
    : null;
  return {
    organizationNumber: e.organisasjonsnummer,
    name: e.navn ?? null,
    organizationForm: e.organisasjonsform?.kode ?? null,
    address: a.address,
    postalCode: a.postalCode,
    city: a.city,
    kommuneNumber: a.kommuneNumber,
    kommuneName: a.kommuneName,
    postAddress: post,
    konkurs: !!e.konkurs,
    konkursdato: /^\d{4}-\d{2}-\d{2}$/.test(e.konkursdato ?? "") ? new Date(`${e.konkursdato}T00:00:00Z`) : null,
    underAvvikling: !!e.underAvvikling,
    tvangsavvikling: !!e.underTvangsavviklingEllerTvangsopplosning,
  };
}

/**
 * What counts as "a change". Kommunenummer/-navn are left out: kommune mergers
 * (e.g. 2020) renumber hundreds of thousands of unchanged addresses. A period
 * instead carries the latest kommune seen for its address.
 */
const keyOf = (v: OpenPeriod["values"]) =>
  [v.name, v.address, v.postalCode, v.postAddress, v.konkurs, v.underAvvikling, v.tvangsavvikling].join("\u0001");

async function* streamEntities(url: string, attempts = 4): AsyncGenerator<ArchivedEntity> {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, { headers: { Accept: "*/*", "User-Agent": "konkurser-i-norge/1.0" } });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const body = Readable.fromWeb(res.body as import("node:stream/web").ReadableStream<Uint8Array>);
      yield* jsonArrayObjects(body.pipe(createGunzip())) as AsyncGenerator<ArchivedEntity>;
      return;
    } catch (e) {
      // Retrying restarts the snapshot from the top. That is safe: entities already
      // seen compare equal to their open period, so nothing is recorded twice.
      if (i >= attempts) throw e;
      await new Promise((r) => setTimeout(r, 5000 * i));
    }
  }
}

/**
 * Rebuild archived_company_periods from all snapshots (oldest first). Runs in
 * one pass because each snapshot is compared with the previous one; on failure
 * it is simply re-run from scratch.
 */
export async function importArchive(
  prisma: PrismaClient,
  opts: { snapshots?: string[]; log?: (m: string) => void } = {}
) {
  const log = opts.log ?? (() => {});
  const snapshots = opts.snapshots ?? ARCHIVED_SNAPSHOTS;
  await prisma.$executeRaw`TRUNCATE archived_company_periods, archived_snapshots`;

  const open = new Map<string, OpenPeriod>();
  let buffer: Prisma.ArchivedCompanyPeriodCreateManyInput[] = [];
  let written = 0;
  const flush = async (force = false) => {
    if (buffer.length < 5000 && !(force && buffer.length)) return;
    for (let i = 0; i < buffer.length; i += 5000) {
      await prisma.archivedCompanyPeriod.createMany({ data: buffer.slice(i, i + 5000) });
    }
    written += buffer.length;
    buffer = [];
  };
  const close = (p: OpenPeriod, nextSeen: Date | null, goneAfter: boolean) =>
    buffer.push({ ...p.values, firstSeen: p.firstSeen, lastSeen: p.lastSeen, nextSeen, goneAfter });

  let previousCount = 0;
  for (const ts of snapshots) {
    const at = tsToDate(ts);
    const url = archiveUrl(ts);
    const seen = new Set<string>();
    let n = 0;
    let changed = 0;
    log(`snapshot ${at.toISOString().slice(0, 10)}: streaming ${url}`);
    for await (const e of streamEntities(url)) {
      if (!e?.organisasjonsnummer) continue;
      n++;
      const org = e.organisasjonsnummer;
      seen.add(org);
      const values = toValues(e);
      const key = keyOf(values);
      const cur = open.get(org);
      if (cur && cur.key === key) {
        cur.lastSeen = at;
        cur.values.kommuneNumber = values.kommuneNumber;
        cur.values.kommuneName = values.kommuneName;
        cur.values.organizationForm = values.organizationForm;
        cur.values.konkursdato = values.konkursdato ?? cur.values.konkursdato;
      } else {
        if (cur) {
          close(cur, at, false);
          changed++;
        }
        open.set(org, { values, key, firstSeen: at, lastSeen: at });
      }
      if (buffer.length >= 5000) await flush();
      if (n % 250_000 === 0) log(`  ${n.toLocaleString()} entities…`);
    }
    // A truncated capture would make every missing company look deleted.
    if (previousCount && seen.size < previousCount * 0.8) {
      throw new Error(`Snapshot ${ts} has only ${seen.size} entities (previous ${previousCount}); looks partial — aborting`);
    }
    previousCount = seen.size;
    // Companies missing from this snapshot were deleted since the previous one.
    let gone = 0;
    for (const [org, p] of Array.from(open)) {
      if (!seen.has(org)) {
        close(p, at, true);
        open.delete(org);
        gone++;
      }
    }
    await flush();
    await prisma.archivedSnapshot.create({ data: { snapshotAt: at, source: url, entities: n } });
    log(`  done: ${seen.size.toLocaleString()} entities, ${changed.toLocaleString()} changed, ${gone.toLocaleString()} gone`);
  }
  for (const p of Array.from(open.values())) close(p, null, false);
  await flush(true);
  log(`archive import complete: ${written.toLocaleString()} periods`);
  return { periods: written, snapshots: snapshots.length };
}

/**
 * Fill unknown origins of feed-recorded moves from the archived snapshot taken
 * just before the move. Only snapshots on/after the feed's change-detail start
 * qualify, and only for a company's first recorded move after that snapshot —
 * every later address change is in the feed, so the snapshot address is
 * exactly the address the company moved from. Sets fromAsOf to the snapshot date.
 */
export async function fillOriginsFromArchive(prisma: PrismaClient, feedStart = new Date("2025-08-15T00:00:00Z")) {
  return prisma.$executeRaw(Prisma.sql`
    WITH cand AS (
      SELECT m.id, m."organizationNumber", m."changedAt", m."toAddress", m."toPostalCode",
             (SELECT MAX(s."snapshotAt") FROM archived_snapshots s
               WHERE s."snapshotAt" >= ${feedStart} AND s."snapshotAt" < m."changedAt") AS snap
      FROM address_moves m
      WHERE m."fromAddress" IS NULL OR m."fromKommuneNumber" IS NULL OR m."fromPostalCode" IS NULL
    ),
    firsts AS (
      SELECT c.* FROM cand c
      WHERE c.snap IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM address_moves o
          WHERE o."organizationNumber" = c."organizationNumber"
            AND o."changedAt" > c.snap AND o."changedAt" < c."changedAt")
    ),
    src AS (
      SELECT f.id, f.snap, p.address, p."postalCode", p.city, p."kommuneNumber", p."kommuneName"
      FROM firsts f
      JOIN archived_company_periods p
        ON p."organizationNumber" = f."organizationNumber"
       AND p."firstSeen" <= f.snap AND p."lastSeen" >= f.snap
      -- sanity: the archived address must differ from where it moved to
      WHERE NOT (p.address IS NOT DISTINCT FROM f."toAddress" AND p."postalCode" IS NOT DISTINCT FROM f."toPostalCode")
    )
    UPDATE address_moves m SET
      "fromAddress"       = COALESCE(m."fromAddress", src.address),
      "fromPostalCode"    = COALESCE(m."fromPostalCode", src."postalCode"),
      "fromCity"          = COALESCE(m."fromCity", src.city),
      "fromKommuneNumber" = COALESCE(m."fromKommuneNumber", src."kommuneNumber"),
      "fromKommuneName"   = COALESCE(m."fromKommuneName", src."kommuneName"),
      "fromAsOf"          = src.snap
    FROM src WHERE m.id = src.id
  `);
}
