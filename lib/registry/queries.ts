import { Prisma, type PrismaClient } from "@prisma/client";
import { FEED_DETAILS_START } from "./client";
import type { BankruptcyType, MoveType } from "./types";

export const MOVE_TYPES: MoveType[] = ["CROSS_KOMMUNE", "NEW_POSTCODE", "SAME_POSTCODE", "UNKNOWN"];
export const BANKRUPTCY_TYPES: BankruptcyType[] = ["KONKURS", "TVANGSAVVIKLING", "AVVIKLING"];

export type Direction = "any" | "in" | "out" | "within";

export interface Coverage {
  /** Earliest date the feed carries change details for. */
  feedStart: string;
  /** Last feed update processed (null = pipeline has not run). */
  lastUpdateAt: string | null;
  caughtUp: boolean;
}

export async function getCoverage(prisma: PrismaClient): Promise<Coverage> {
  const cursor = await prisma.registryFeedCursor.findUnique({ where: { feed: "enheter" } });
  return {
    feedStart: FEED_DETAILS_START,
    lastUpdateAt: cursor?.lastUpdateAt.toISOString() ?? null,
    caughtUp: !!cursor && Date.now() - cursor.lastUpdateAt.getTime() < 3 * 24 * 60 * 60 * 1000,
  };
}

export interface MoveQuery {
  kommune?: string;
  direction?: Direction;
  since?: Date;
  types?: MoveType[];
  limit?: number;
  offset?: number;
}

export async function listMoves(prisma: PrismaClient, q: MoveQuery) {
  const where: Prisma.AddressMoveWhereInput = {};
  if (q.since) where.changedAt = { gte: q.since };
  if (q.types?.length) where.moveType = { in: q.types };

  let unknownOrigin = 0;
  if (q.kommune) {
    const k = q.kommune;
    switch (q.direction ?? "any") {
      case "in":
        Object.assign(where, { moveType: "CROSS_KOMMUNE", toKommuneNumber: k });
        break;
      case "out":
        Object.assign(where, { moveType: "CROSS_KOMMUNE", fromKommuneNumber: k });
        break;
      case "within":
        Object.assign(where, {
          moveType: { in: (q.types ?? MOVE_TYPES).filter((t) => t === "NEW_POSTCODE" || t === "SAME_POSTCODE") },
          toKommuneNumber: k,
        });
        break;
      default:
        where.OR = [{ toKommuneNumber: k }, { fromKommuneNumber: k }];
    }
    // Cross-kommune moves whose origin is unknown could have come from this kommune.
    if (q.direction === "out" || q.direction === "any" || !q.direction) {
      unknownOrigin = await prisma.addressMove.count({
        where: {
          moveType: "CROSS_KOMMUNE",
          fromKommuneNumber: null,
          NOT: { toKommuneNumber: k },
          ...(q.since ? { changedAt: { gte: q.since } } : {}),
        },
      });
    }
  }

  const [total, moves] = await Promise.all([
    prisma.addressMove.count({ where }),
    prisma.addressMove.findMany({
      where,
      orderBy: { changedAt: "desc" },
      take: q.limit ?? 100,
      skip: q.offset ?? 0,
      select: {
        id: true,
        organizationNumber: true,
        companyName: true,
        changedAt: true,
        moveType: true,
        fromAddress: true,
        fromPostalCode: true,
        fromCity: true,
        fromKommuneNumber: true,
        fromKommuneName: true,
        toAddress: true,
        toPostalCode: true,
        toCity: true,
        toKommuneNumber: true,
        toKommuneName: true,
      },
    }),
  ]);

  // For each move: did the company later go bankrupt / get forcibly dissolved?
  // Same rule as the bankruptcy view: the event date must be after the move.
  const orgs = Array.from(new Set(moves.map((m) => m.organizationNumber)));
  const events = orgs.length
    ? await prisma.bankruptcyEvent.findMany({
        where: { organizationNumber: { in: orgs }, eventType: { in: ["KONKURS", "TVANGSAVVIKLING"] } },
        select: { organizationNumber: true, eventType: true, eventDate: true },
        orderBy: { eventDate: "asc" },
      })
    : [];
  const withLater = moves.map((m) => {
    const e = events.find((ev) => ev.organizationNumber === m.organizationNumber && ev.eventDate > m.changedAt);
    return {
      ...m,
      laterBankruptcy: e
        ? {
            eventType: e.eventType as BankruptcyType,
            eventDate: e.eventDate,
            daysAfter: calendarDaysBetween(m.changedAt, e.eventDate),
          }
        : null,
    };
  });
  return { total, unknownOrigin, moves: withLater };
}

/** Whole calendar days (UTC) from `a` to `b` — same as `b::date - a::date` in SQL. */
export function calendarDaysBetween(a: Date, b: Date): number {
  const day = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.round((day(b) - day(a)) / (24 * 60 * 60 * 1000));
}

export interface BankruptMoverQuery {
  kommune?: string;
  /** Only bankruptcies on or after this date. */
  since?: Date;
  /** How many days before the bankruptcy a move counts. */
  windowDays?: number;
  types?: BankruptcyType[];
  moveTypes?: MoveType[];
  sort?: BankruptSort;
  order?: "asc" | "desc";
  limit?: number;
}

export const BANKRUPT_SORTS = ["eventDate", "daysBefore", "name"] as const;
export type BankruptSort = (typeof BANKRUPT_SORTS)[number];

// Allow-listed ORDER BY expressions (never interpolate user input into SQL).
const BANKRUPT_SORT_SQL: Record<BankruptSort, string> = {
  eventDate: `b."eventDate"`,
  daysBefore: `MIN(b."eventDate"::date - m."changedAt"::date)`,
  name: `COALESCE(b."companyName", MAX(m."companyName"))`,
};

export interface BankruptMover {
  eventId: string;
  organizationNumber: string;
  companyName: string | null;
  eventType: BankruptcyType;
  eventDate: Date;
  /** Calendar days from the move closest to the bankruptcy to the bankruptcy date (≥ 1). */
  minDaysBefore: number;
  moves: {
    changedAt: string;
    daysBefore: number;
    moveType: MoveType;
    fromAddress: string | null;
    fromPostalCode: string | null;
    fromCity: string | null;
    fromKommuneNumber: string | null;
    fromKommuneName: string | null;
    toAddress: string | null;
    toPostalCode: string | null;
    toCity: string | null;
    toKommuneNumber: string | null;
    toKommuneName: string | null;
  }[];
}

/**
 * Companies flagged bankrupt (or dissolved) that changed business address in
 * the `windowDays` before the bankruptcy date. Moves on or after the date are
 * excluded — Brreg often moves a konkursbo to the trustee's address.
 */
export async function listBankruptMovers(prisma: PrismaClient, q: BankruptMoverQuery) {
  const windowDays = q.windowDays ?? 365;
  const types = q.types?.length ? q.types : (["KONKURS"] as BankruptcyType[]);
  const moveTypes = q.moveTypes?.length ? q.moveTypes : MOVE_TYPES;
  const since = q.since ?? new Date(FEED_DETAILS_START);
  const kommune = q.kommune ?? null;
  const sortExpr = BANKRUPT_SORT_SQL[q.sort ?? "eventDate"];
  const direction = q.order === "asc" ? "ASC" : "DESC";
  // Tie-breakers keep paging stable.
  const orderBy = Prisma.raw(`${sortExpr} ${direction} NULLS LAST, b."eventDate" DESC, b.id`);

  const rows = await prisma.$queryRaw<BankruptMover[]>(Prisma.sql`
    SELECT
      b.id AS "eventId",
      b."organizationNumber",
      COALESCE(b."companyName", MAX(m."companyName")) AS "companyName",
      b."eventType",
      b."eventDate",
      MIN(b."eventDate"::date - m."changedAt"::date) AS "minDaysBefore",
      json_agg(json_build_object(
        -- columns are UTC timestamps without zone; emit explicit UTC ISO strings
        'changedAt', to_char(m."changedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'daysBefore', b."eventDate"::date - m."changedAt"::date,
        'moveType', m."moveType",
        'fromAddress', m."fromAddress",
        'fromPostalCode', m."fromPostalCode",
        'fromCity', m."fromCity",
        'fromKommuneNumber', m."fromKommuneNumber",
        'fromKommuneName', m."fromKommuneName",
        'toAddress', m."toAddress",
        'toPostalCode', m."toPostalCode",
        'toCity', m."toCity",
        'toKommuneNumber', m."toKommuneNumber",
        'toKommuneName', m."toKommuneName"
      ) ORDER BY m."changedAt") AS moves
    FROM bankruptcy_events b
    JOIN address_moves m
      ON m."organizationNumber" = b."organizationNumber"
     AND m."changedAt" < b."eventDate"
     AND m."changedAt" >= b."eventDate" - make_interval(days => ${windowDays}::int)
     AND m."moveType" = ANY(${moveTypes}::text[])
    WHERE b."eventType" = ANY(${types}::text[])
      AND b."eventDate" >= ${since}
      AND (${kommune}::text IS NULL
           OR m."toKommuneNumber" = ${kommune}::text
           OR m."fromKommuneNumber" = ${kommune}::text)
    GROUP BY b.id
    ORDER BY ${orderBy}
    LIMIT ${q.limit ?? 200}::int
  `);
  return rows;
}
