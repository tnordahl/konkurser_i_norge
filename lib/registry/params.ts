import { BANKRUPTCY_TYPES, MOVE_TYPES, type Direction } from "./queries";
import type { BankruptcyType, MoveType } from "./types";

/** Shared, validated query-string parsing for the registry API routes. */
export function parseCommon(sp: URLSearchParams) {
  const kommuneRaw = sp.get("kommune")?.trim();
  if (kommuneRaw && !/^\d{4}$/.test(kommuneRaw)) {
    throw new ParamError("kommune must be a 4-digit kommunenummer");
  }
  const days = int(sp.get("days"), 30, 1, 1000);
  return {
    kommune: kommuneRaw || undefined,
    days,
    since: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
    limit: int(sp.get("limit"), 100, 1, 500),
    offset: int(sp.get("offset"), 0, 0, 100000),
    moveTypes: list<MoveType>(sp.get("moveTypes"), MOVE_TYPES),
  };
}

export function parseDirection(v: string | null): Direction {
  return v === "in" || v === "out" || v === "within" ? v : "any";
}

export function parseBankruptcyTypes(v: string | null): BankruptcyType[] | undefined {
  return list<BankruptcyType>(v, BANKRUPTCY_TYPES);
}

export function int(v: string | null, def: number, min: number, max: number): number {
  if (v === null || v === "") return def;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new ParamError(`expected an integer between ${min} and ${max}, got "${v}"`);
  }
  return n;
}

function list<T extends string>(v: string | null, allowed: readonly T[]): T[] | undefined {
  if (!v) return undefined;
  const items = v.split(",").map((s) => s.trim()).filter(Boolean);
  const bad = items.filter((i) => !allowed.includes(i as T));
  if (bad.length) throw new ParamError(`unknown value(s): ${bad.join(", ")}`);
  return items as T[];
}

export class ParamError extends Error {}
