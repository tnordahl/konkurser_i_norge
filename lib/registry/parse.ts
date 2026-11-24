import type {
  AddressPatch,
  AddressValue,
  BankruptcyType,
  BrregAddress,
  FeedUpdate,
  MoveType,
  ParsedUpdate,
} from "./types";

const ADDRESS_ROOT = "/forretningsadresse";

/** Flags that mean the company is going under, and the date field Brreg pairs with each. */
const BANKRUPTCY_FLAGS: Record<string, { type: BankruptcyType; dateField?: string }> = {
  "/konkurs": { type: "KONKURS", dateField: "/konkursdato" },
  "/underTvangsavviklingEllerTvangsopplosning": { type: "TVANGSAVVIKLING" },
  "/underAvvikling": { type: "AVVIKLING", dateField: "/underAvviklingDato" },
};

const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v.trim() : null;

/** Brreg dates are "YYYY-MM-DD"; anything else falls back to the feed date. */
function parseDate(v: unknown, fallback: Date): Date {
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    return new Date(`${v}T00:00:00.000Z`);
  }
  return fallback;
}

export function addressFromBrreg(a: BrregAddress | undefined | null): AddressValue {
  return {
    address: joinLines(a?.adresse ?? []),
    postalCode: str(a?.postnummer),
    city: str(a?.poststed),
    kommuneNumber: str(a?.kommunenummer),
    kommuneName: str(a?.kommune),
  };
}

export function joinLines(lines: (string | null | undefined)[]): string | null {
  const parts = lines.map(str).filter((l): l is string => l !== null);
  return parts.length ? parts.join(", ") : null;
}

/**
 * Turn one feed update into facts. Pure: no I/O, no prior state.
 * Returns null when the update carries nothing this pipeline uses.
 */
export function parseUpdate(update: FeedUpdate): ParsedUpdate | null {
  const changes = update.endringer;
  if (!changes || changes.length === 0) return null;

  const registeredAt = new Date(update.dato);
  let name: string | null = null;
  const values = new Map<string, unknown>();
  const address: AddressPatch = {
    isMove: false,
    kommuneChanged: false,
    postalCodeChanged: false,
    lineOps: [],
  };
  let touchedAddress = false;

  for (const c of changes) {
    if (c.op === "add" || c.op === "replace") values.set(c.path, c.value);

    if (c.path === "/navn" && (c.op === "add" || c.op === "replace")) {
      name = str(c.value);
    }

    // A whole address moved away from forretningsadresse counts as removed.
    if (c.op === "move" && c.from === ADDRESS_ROOT) {
      touchedAddress = true;
      address.wholeRemoved = true;
      continue;
    }
    if (!c.path.startsWith(ADDRESS_ROOT)) continue;
    touchedAddress = true;

    const rest = c.path.slice(ADDRESS_ROOT.length).split("/").filter(Boolean);
    if (rest.length === 0) {
      if (c.op === "remove" || c.op === "move") address.wholeRemoved = true;
      else if (c.op === "add" || c.op === "replace") {
        address.whole = addressFromBrreg(c.value as BrregAddress);
      }
      continue;
    }

    const [field, idx] = rest;
    const val = c.op === "remove" ? null : str(c.value);
    switch (field) {
      case "adresse": {
        if (idx === undefined) {
          // whole lines array set/removed
          const lines = c.op === "remove" ? [] : ((c.value as string[]) ?? []);
          address.lineOps.push({ index: -1, op: "remove" });
          lines.forEach((l, i) => address.lineOps.push({ index: i, op: "set", value: l }));
        } else {
          const index = Number(idx);
          if (!Number.isInteger(index)) break;
          address.lineOps.push(
            c.op === "remove" ? { index, op: "remove" } : { index, op: "set", value: val ?? "" }
          );
        }
        break;
      }
      case "postnummer":
        address.postalCode = val;
        address.postalCodeChanged = true;
        break;
      case "poststed":
        address.city = val;
        break;
      case "kommunenummer":
        address.kommuneNumber = val;
        address.kommuneChanged = true;
        break;
      case "kommune":
        address.kommuneName = val;
        break;
      // land / landkode: ignored
    }
  }

  // A move = the street lines or the postcode changed. Kommune-only edits are
  // administrative recodes (kommune mergers/renames), not moves. Adding an
  // address where none existed, or removing it, is not a move either.
  address.isMove = address.lineOps.length > 0 || address.postalCodeChanged;
  if (address.whole && !address.wholeRemoved) address.isMove = true;

  const bankruptcies: ParsedUpdate["bankruptcies"] = [];
  for (const [flag, { type, dateField }] of Object.entries(BANKRUPTCY_FLAGS)) {
    if (values.get(flag) === true) {
      bankruptcies.push({
        type,
        eventDate: parseDate(dateField ? values.get(dateField) : undefined, registeredAt),
      });
    }
  }

  if (!touchedAddress && !name && bankruptcies.length === 0) return null;

  return {
    updateId: update.oppdateringsid,
    organizationNumber: update.organisasjonsnummer,
    registeredAt,
    name,
    address: touchedAddress ? address : null,
    bankruptcies,
  };
}

/** Prior address state as kept by the pipeline (lines kept separately to apply line ops). */
export interface KnownAddress extends AddressValue {
  lines: string[] | null; // null = lines unknown
}

export interface AppliedAddress {
  next: KnownAddress;
  moveType: MoveType | null; // null = not a move
}

/**
 * Apply an address patch on top of what we knew before.
 * `prior` null = we have never seen this organisation's address.
 * Fields we cannot know stay null — nothing is guessed.
 */
export function applyAddressPatch(prior: KnownAddress | null, patch: AddressPatch): AppliedAddress {
  if (patch.wholeRemoved) {
    return {
      next: { address: null, postalCode: null, city: null, kommuneNumber: null, kommuneName: null, lines: [] },
      moveType: null,
    };
  }

  if (patch.whole) {
    const w = patch.whole;
    const lines = w.address ? w.address.split(", ") : [];
    let moveType: MoveType | null;
    if (!prior) moveType = "UNKNOWN"; // changed, but we can't say from what
    else if (prior.address === null && prior.postalCode === null) moveType = null; // added where none existed
    else if (prior.address === w.address && prior.postalCode === w.postalCode) moveType = null;
    else moveType = classify(prior, w);
    return { next: { ...w, lines }, moveType };
  }

  // Line-level edits. Without the prior lines we only know the result when the
  // patch rewrites the whole array (index -1 marker).
  let lines: string[] | null = prior?.lines ? [...prior.lines] : null;
  if (patch.lineOps.some((o) => o.index === -1)) lines = [];
  for (const o of patch.lineOps) {
    if (o.index === -1 || lines === null) continue;
    if (o.op === "remove") lines.splice(o.index, 1);
    else lines[o.index] = o.value ?? "";
  }
  const pick = (k: "postalCode" | "city" | "kommuneNumber" | "kommuneName"): string | null =>
    patch[k] !== undefined ? (patch[k] ?? null) : (prior?.[k] ?? null);

  const next: KnownAddress = {
    lines,
    address: lines ? joinLines(lines) : null,
    postalCode: pick("postalCode"),
    city: pick("city"),
    kommuneNumber: pick("kommuneNumber"),
    kommuneName: pick("kommuneName"),
  };

  if (!patch.isMove) return { next, moveType: null };
  const moveType: MoveType = patch.kommuneChanged
    ? "CROSS_KOMMUNE"
    : patch.postalCodeChanged
      ? "NEW_POSTCODE"
      : "SAME_POSTCODE";
  return { next, moveType };
}

function classify(a: AddressValue, b: AddressValue): MoveType {
  if (a.kommuneNumber && b.kommuneNumber && a.kommuneNumber !== b.kommuneNumber) return "CROSS_KOMMUNE";
  if (a.postalCode !== b.postalCode) return "NEW_POSTCODE";
  return "SAME_POSTCODE";
}
