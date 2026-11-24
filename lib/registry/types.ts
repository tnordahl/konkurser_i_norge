/**
 * Types for Brønnøysundregistrene's update feed:
 * GET https://data.brreg.no/enhetsregisteret/api/oppdateringer/enheter?includeChanges=true
 *
 * `endringer` is a JSON Patch (RFC 6902) holding only the NEW values. It is
 * present from roughly late August 2025; older updates have no change details.
 */

export interface FeedChange {
  op: "add" | "replace" | "remove" | "move" | "copy" | "test";
  path: string;
  value?: unknown;
  from?: string;
}

export interface FeedUpdate {
  oppdateringsid: number;
  dato: string; // ISO timestamp when Brreg registered the update
  organisasjonsnummer: string;
  endringstype: string; // Ny | Endring | Sletting | Fjernet | Ukjent
  endringer?: FeedChange[];
}

/** A business address (forretningsadresse) as stored by the pipeline. */
export interface AddressValue {
  address: string | null;
  postalCode: string | null;
  city: string | null;
  kommuneNumber: string | null;
  kommuneName: string | null;
}

export type MoveType =
  | "CROSS_KOMMUNE" // kommunenummer changed
  | "NEW_POSTCODE" // postnummer changed, same kommune
  | "SAME_POSTCODE" // only the street address lines changed
  | "UNKNOWN"; // whole address object replaced and the previous one is unknown

export type BankruptcyType = "KONKURS" | "TVANGSAVVIKLING" | "AVVIKLING";

/** What one feed update tells us, before it is combined with prior state. */
export interface ParsedUpdate {
  updateId: number;
  organizationNumber: string;
  registeredAt: Date;
  /** Newly registered organisation ("Ny" updates carry no change details). */
  isNew: boolean;
  name: string | null; // new name if /navn changed
  address: AddressPatch | null;
  bankruptcies: { type: BankruptcyType; eventDate: Date }[];
}

export interface AddressPatch {
  /** true when the street address or postcode changed (a real move) */
  isMove: boolean;
  kommuneChanged: boolean;
  postalCodeChanged: boolean;
  /** Fields set by the patch. `undefined` = not touched, `null` = removed. */
  postalCode?: string | null;
  city?: string | null;
  kommuneNumber?: string | null;
  kommuneName?: string | null;
  /** Line-level edits to `adresse` (an array of address lines). */
  lineOps: { index: number; op: "set" | "remove"; value?: string }[];
  /** Whole address object set (add/replace) — value known in full. */
  whole?: AddressValue;
  /** Whole address object removed or moved elsewhere. */
  wholeRemoved?: boolean;
}

export interface RegistryEntity {
  organisasjonsnummer: string;
  navn?: string;
  forretningsadresse?: BrregAddress;
  slettedato?: string;
}

export interface BrregAddress {
  adresse?: string[];
  postnummer?: string;
  poststed?: string;
  kommune?: string;
  kommunenummer?: string;
  land?: string;
  landkode?: string;
}
