import type { Prisma, PrismaClient, RegistryAddressState } from "@prisma/client";
import { fetchFeedPage, lookupEntities, FEED_DETAILS_START } from "./client";
import { addressFromBrreg, applyAddressPatch, parseUpdate, type KnownAddress } from "./parse";
import type { FeedUpdate, ParsedUpdate } from "./types";

const FEED = "enheter";
const DAY = 24 * 60 * 60 * 1000;

type Log = (msg: string) => void;
type StateRow = Omit<RegistryAddressState, "addressLines"> & { addressLines: string[] | null };

export interface IngestOptions {
  /** Stop starting new pages after this timestamp (ms). */
  deadline?: number;
  maxPages?: number;
  pageSize?: number;
  /** Where to start when there is no cursor yet. */
  startDate?: string;
  log?: Log;
}

export interface IngestResult {
  pages: number;
  updatesSeen: number;
  movesAdded: number;
  bankruptciesAdded: number;
  lastUpdateId: number | null;
  lastUpdateAt: Date | null;
  caughtUp: boolean;
}

/** Read the Brreg feed from the stored cursor and record moves and bankruptcies. */
export async function ingestFeed(prisma: PrismaClient, opts: IngestOptions = {}): Promise<IngestResult> {
  const pageSize = opts.pageSize ?? 10000;
  const log = opts.log ?? (() => {});
  const cursor = await prisma.registryFeedCursor.findUnique({ where: { feed: FEED } });
  let lastUpdateId = cursor?.lastUpdateId ?? null;
  let lastUpdateAt = cursor?.lastUpdateAt ?? null;
  const result: IngestResult = {
    pages: 0,
    updatesSeen: 0,
    movesAdded: 0,
    bankruptciesAdded: 0,
    lastUpdateId,
    lastUpdateAt,
    caughtUp: false,
  };

  while (true) {
    if (opts.maxPages !== undefined && result.pages >= opts.maxPages) break;
    if (opts.deadline !== undefined && Date.now() > opts.deadline) break;

    const updates = await fetchFeedPage(
      lastUpdateId !== null
        ? { fromId: lastUpdateId + 1, size: pageSize }
        : { fromDate: opts.startDate ?? FEED_DETAILS_START, size: pageSize }
    );
    if (updates.length === 0) {
      result.caughtUp = true;
      break;
    }

    const { moves, bankruptcies } = await processPage(prisma, updates);
    const last = updates[updates.length - 1];
    lastUpdateId = last.oppdateringsid;
    lastUpdateAt = new Date(last.dato);

    result.pages++;
    result.updatesSeen += updates.length;
    result.movesAdded += moves;
    result.bankruptciesAdded += bankruptcies;
    result.lastUpdateId = lastUpdateId;
    result.lastUpdateAt = lastUpdateAt;
    log(
      `page ${result.pages}: ${updates.length} updates up to ${last.dato} (id ${lastUpdateId}) → ${moves} moves, ${bankruptcies} bankruptcy events`
    );

    if (updates.length < pageSize) {
      result.caughtUp = true;
      break;
    }
  }
  return result;
}

function toKnown(s: StateRow | undefined): KnownAddress | null {
  // We only "know" an address once the feed, a lookup or the snapshot gave us one.
  if (!s || (s.lastAddressAt === null && (s.source === "FEED" || s.source === "NEW"))) return null;
  return {
    lines: s.addressLines,
    address: s.address,
    postalCode: s.postalCode,
    city: s.city,
    kommuneNumber: s.kommuneNumber,
    kommuneName: s.kommuneName,
  };
}

function emptyState(org: string, at: Date): StateRow {
  return {
    organizationNumber: org,
    name: null,
    addressLines: null,
    address: null,
    postalCode: null,
    city: null,
    kommuneNumber: null,
    kommuneName: null,
    kommuneChangedAt: null,
    lastAddressAt: null,
    asOf: at,
    source: "FEED",
  };
}

async function loadStates(prisma: PrismaClient, orgs: string[]): Promise<Map<string, StateRow>> {
  const rows = await prisma.registryAddressState.findMany({ where: { organizationNumber: { in: orgs } } });
  return new Map(
    rows.map((r) => [
      r.organizationNumber,
      { ...r, addressLines: Array.isArray(r.addressLines) ? (r.addressLines as string[]) : null },
    ])
  );
}

function stateData(s: StateRow): Prisma.RegistryAddressStateCreateManyInput {
  return { ...s, addressLines: s.addressLines ?? undefined };
}

async function processPage(prisma: PrismaClient, updates: FeedUpdate[]) {
  const parsed = updates.map(parseUpdate).filter((p): p is ParsedUpdate => p !== null);
  const orgs = Array.from(new Set(parsed.map((p) => p.organizationNumber)));
  const states = await loadStates(prisma, orgs);
  const dirty = new Set<string>();
  const moves: Prisma.AddressMoveCreateManyInput[] = [];
  const bankruptcies: Prisma.BankruptcyEventCreateManyInput[] = [];

  for (const p of parsed) {
    const org = p.organizationNumber;
    let s = states.get(org);

    if (p.isNew && !s) {
      // Placeholder: resolvePending looks up its address (source NEW → LOOKUP).
      s = { ...emptyState(org, p.registeredAt), source: "NEW" };
      dirty.add(org);
    }

    if (p.name) {
      s = s ?? emptyState(org, p.registeredAt);
      s.name = p.name;
      dirty.add(org);
    }

    if (p.address) {
      const prior = toKnown(s);
      const { next, moveType } = applyAddressPatch(prior, p.address);

      if (moveType) {
        const sameKommune = moveType === "SAME_POSTCODE" || moveType === "NEW_POSTCODE";
        moves.push({
          updateId: p.updateId,
          organizationNumber: org,
          companyName: s?.name ?? null,
          changedAt: p.registeredAt,
          moveType,
          fromAddress: prior?.address ?? null,
          fromPostalCode: prior?.postalCode ?? null,
          fromCity: prior?.city ?? null,
          fromKommuneNumber: prior?.kommuneNumber ?? (sameKommune ? next.kommuneNumber : null),
          fromKommuneName: prior?.kommuneName ?? (sameKommune ? next.kommuneName : null),
          toAddress: next.address,
          toPostalCode: next.postalCode,
          toCity: next.city,
          toKommuneNumber: next.kommuneNumber,
          toKommuneName: next.kommuneName,
        });
      }

      s = s ?? emptyState(org, p.registeredAt);
      const kommuneMayHaveChanged =
        p.address.kommuneChanged || p.address.whole !== undefined || p.address.wholeRemoved === true;
      Object.assign(s, {
        addressLines: next.lines,
        address: next.address,
        postalCode: next.postalCode,
        city: next.city,
        kommuneNumber: next.kommuneNumber,
        kommuneName: next.kommuneName,
        lastAddressAt: p.registeredAt,
        kommuneChangedAt: kommuneMayHaveChanged ? p.registeredAt : s.kommuneChangedAt,
        asOf: p.registeredAt,
        source: "FEED",
      });
      dirty.add(org);
    }

    if (s) states.set(org, s);

    for (const b of p.bankruptcies) {
      bankruptcies.push({
        updateId: p.updateId,
        organizationNumber: org,
        companyName: s?.name ?? null,
        eventType: b.type,
        eventDate: b.eventDate,
        registeredAt: p.registeredAt,
      });
    }
  }

  const last = updates[updates.length - 1];
  const dirtyOrgs = Array.from(dirty);
  const [movesRes, bankRes] = await prisma.$transaction([
    prisma.addressMove.createMany({ data: moves, skipDuplicates: true }),
    prisma.bankruptcyEvent.createMany({ data: bankruptcies, skipDuplicates: true }),
    prisma.registryAddressState.deleteMany({ where: { organizationNumber: { in: dirtyOrgs } } }),
    prisma.registryAddressState.createMany({ data: dirtyOrgs.map((o) => stateData(states.get(o)!)) }),
    prisma.registryFeedCursor.upsert({
      where: { feed: FEED },
      create: { feed: FEED, lastUpdateId: last.oppdateringsid, lastUpdateAt: new Date(last.dato) },
      update: { lastUpdateId: last.oppdateringsid, lastUpdateAt: new Date(last.dato) },
    }),
  ]);
  return { moves: movesRes.count, bankruptcies: bankRes.count };
}

export interface ResolveResult {
  skipped?: string;
  orgsLookedUp: number;
  movesResolved: number;
  bankruptciesResolved: number;
  newOrgsResolved: number;
}

/**
 * Fill in what feed patches leave out (company name, the kommune of moves that
 * stayed inside one kommune, the full address) from Brreg's current data.
 *
 * Only fills a value when it is provably the same at the time of the move:
 * - kommune: only if no feed update changed kommunenummer after the move
 * - address/postcode: only for the org's latest address change, and only when
 *   the current registry data agrees with every field the patch did tell us
 * Runs only once the feed cursor is caught up, so "current" means "after the
 * last update we processed".
 */
export async function resolvePending(
  prisma: PrismaClient,
  opts: { limit?: number; maxSingles?: number; log?: Log } = {}
): Promise<ResolveResult> {
  const limit = opts.limit ?? 1000;
  const empty: ResolveResult = { orgsLookedUp: 0, movesResolved: 0, bankruptciesResolved: 0, newOrgsResolved: 0 };
  const cursor = await prisma.registryFeedCursor.findUnique({ where: { feed: FEED } });
  if (!cursor || Date.now() - cursor.lastUpdateAt.getTime() > 3 * DAY) {
    return { ...empty, skipped: "feed not caught up yet" };
  }

  const [moves, events, newOrgs] = await Promise.all([
    prisma.addressMove.findMany({ where: { resolvedAt: null }, take: limit, orderBy: { changedAt: "desc" } }),
    prisma.bankruptcyEvent.findMany({ where: { resolvedAt: null }, take: limit, orderBy: { eventDate: "desc" } }),
    // Newly registered orgs (placeholders) — record their address so a first move has an origin.
    prisma.registryAddressState.findMany({
      where: { source: "NEW" },
      take: limit,
      select: { organizationNumber: true },
    }),
  ]);
  const placeholders = newOrgs.map((s) => s.organizationNumber);
  const orgs = Array.from(new Set([...moves, ...events].map((r) => r.organizationNumber).concat(placeholders)));
  if (orgs.length === 0) return empty;

  const states = await loadStates(prisma, orgs);
  // Deleted companies need one request each; only spend that on companies that
  // went bankrupt / were dissolved, whose names matter for the bankruptcy view.
  const bankrupt = await prisma.bankruptcyEvent.findMany({
    where: { organizationNumber: { in: orgs } },
    select: { organizationNumber: true },
    distinct: ["organizationNumber"],
  });
  const { found, attempted } = await lookupEntities(orgs, {
    singlesFor: new Set(bankrupt.map((b) => b.organizationNumber)),
    maxSingles: opts.maxSingles ?? 100,
  });
  const now = new Date();
  const ops: Prisma.PrismaPromise<unknown>[] = [];
  let movesResolved = 0;
  let bankruptciesResolved = 0;

  for (const m of moves) {
    if (!attempted.has(m.organizationNumber)) continue; // try again next run
    const e = found.get(m.organizationNumber);
    const s = states.get(m.organizationNumber);
    const data: Prisma.AddressMoveUpdateInput = { resolvedAt: now };

    if (e) {
      const cur = addressFromBrreg(e.forretningsadresse);
      if (!m.companyName && e.navn) data.companyName = e.navn;

      const kommuneStable = !s?.kommuneChangedAt || s.kommuneChangedAt <= m.changedAt;
      if (kommuneStable && cur.kommuneNumber && m.moveType !== "UNKNOWN") {
        if (!m.toKommuneNumber) {
          data.toKommuneNumber = cur.kommuneNumber;
          data.toKommuneName = cur.kommuneName;
        }
        if (m.moveType !== "CROSS_KOMMUNE" && !m.fromKommuneNumber) {
          data.fromKommuneNumber = cur.kommuneNumber;
          data.fromKommuneName = cur.kommuneName;
        }
      }

      const isLatest = s?.lastAddressAt?.getTime() === m.changedAt.getTime();
      const agrees =
        (!m.toPostalCode || m.toPostalCode === cur.postalCode) &&
        (!m.toAddress || m.toAddress === cur.address) &&
        (!m.toKommuneNumber || m.toKommuneNumber === cur.kommuneNumber);
      if (isLatest && agrees) {
        if (!m.toAddress) data.toAddress = cur.address;
        if (!m.toPostalCode) data.toPostalCode = cur.postalCode;
        if (!m.toCity) data.toCity = cur.city;
      }
    }
    ops.push(prisma.addressMove.update({ where: { id: m.id }, data }));
    movesResolved++;
  }

  for (const b of events) {
    if (!attempted.has(b.organizationNumber)) continue;
    const e = found.get(b.organizationNumber);
    ops.push(
      prisma.bankruptcyEvent.update({
        where: { id: b.id },
        data: { resolvedAt: now, ...(e?.navn && !b.companyName ? { companyName: e.navn } : {}) },
      })
    );
    bankruptciesResolved++;
  }

  // Remember what we learned so the next move of these orgs has a known "from".
  let newResolved = 0;
  for (const org of orgs) {
    const e = found.get(org);
    if (!e) {
      // Placeholder we could not find (e.g. deleted again): stop retrying.
      if (placeholders.includes(org) && attempted.has(org)) {
        ops.push(prisma.registryAddressState.update({ where: { organizationNumber: org }, data: { source: "FEED" } }));
        newResolved++;
      }
      continue;
    }
    if (states.get(org)?.source === "NEW") newResolved++;
    const cur = addressFromBrreg(e.forretningsadresse);
    const s = states.get(org);
    if (!s) {
      ops.push(
        prisma.registryAddressState.create({
          data: {
            organizationNumber: org,
            name: e.navn ?? null,
            addressLines: e.forretningsadresse?.adresse ?? [],
            ...cur,
            asOf: now,
            source: "LOOKUP",
          },
        })
      );
      continue;
    }
    const agrees =
      (!s.postalCode || s.postalCode === cur.postalCode) &&
      (!s.address || s.address === cur.address) &&
      (!s.kommuneNumber || s.kommuneNumber === cur.kommuneNumber);
    if (!agrees) continue;
    ops.push(
      prisma.registryAddressState.update({
        where: { organizationNumber: org },
        data: {
          name: s.name ?? e.navn ?? null,
          addressLines: s.addressLines ?? e.forretningsadresse?.adresse ?? [],
          ...cur,
          source: "LOOKUP",
          asOf: now,
        },
      })
    );
  }

  for (let i = 0; i < ops.length; i += 500) await prisma.$transaction(ops.slice(i, i + 500));
  opts.log?.(
    `resolved ${movesResolved} moves, ${bankruptciesResolved} bankruptcy events, ${newResolved} new orgs (${orgs.length} orgs looked up)`
  );
  return { orgsLookedUp: orgs.length, movesResolved, bankruptciesResolved, newOrgsResolved: newResolved };
}
