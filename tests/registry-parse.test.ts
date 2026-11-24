import { test } from "node:test";
import assert from "node:assert/strict";
import { applyAddressPatch, parseUpdate, type KnownAddress } from "../lib/registry/parse";
import type { FeedChange, FeedUpdate } from "../lib/registry/types";

const upd = (endringer: FeedChange[], id = 1): FeedUpdate => ({
  oppdateringsid: id,
  dato: "2026-03-10T05:00:00.000Z",
  organisasjonsnummer: "999999999",
  endringstype: "Endring",
  endringer,
});

const known: KnownAddress = {
  lines: ["Storgata 1", "c/o Revisor AS"],
  address: "Storgata 1, c/o Revisor AS",
  postalCode: "4950",
  city: "RISØR",
  kommuneNumber: "4201",
  kommuneName: "RISØR",
};

test("cross-kommune move with no prior state: destination known, origin unknown", () => {
  const p = parseUpdate(
    upd([
      { op: "replace", path: "/forretningsadresse/adresse/0", value: "Strynevegen 1135" },
      { op: "replace", path: "/forretningsadresse/postnummer", value: "6783" },
      { op: "replace", path: "/forretningsadresse/poststed", value: "STRYN" },
      { op: "replace", path: "/forretningsadresse/kommunenummer", value: "4651" },
      { op: "replace", path: "/forretningsadresse/kommune", value: "STRYN" },
    ])
  )!;
  const r = applyAddressPatch(null, p.address!);
  assert.equal(r.moveType, "CROSS_KOMMUNE");
  assert.equal(r.next.kommuneNumber, "4651");
  assert.equal(r.next.postalCode, "6783");
  assert.equal(r.next.address, null, "street lines unknown without prior lines — not guessed");
});

test("street-only change on a known address keeps kommune and replaces/removes lines", () => {
  const p = parseUpdate(
    upd([
      { op: "replace", path: "/forretningsadresse/adresse/0", value: "Kragsgata 5" },
      { op: "remove", path: "/forretningsadresse/adresse/1" },
    ])
  )!;
  const r = applyAddressPatch(known, p.address!);
  assert.equal(r.moveType, "SAME_POSTCODE");
  assert.equal(r.next.address, "Kragsgata 5");
  assert.equal(r.next.kommuneNumber, "4201");
});

test("postcode change within kommune is NEW_POSTCODE", () => {
  const p = parseUpdate(
    upd([
      { op: "replace", path: "/forretningsadresse/adresse/0", value: "Havnegata 2" },
      { op: "replace", path: "/forretningsadresse/postnummer", value: "4951" },
    ])
  )!;
  assert.equal(applyAddressPatch(known, p.address!).moveType, "NEW_POSTCODE");
});

test("kommune-only recode (merger/rename) is not a move", () => {
  const p = parseUpdate(
    upd([
      { op: "replace", path: "/forretningsadresse/kommunenummer", value: "4202" },
      { op: "replace", path: "/forretningsadresse/kommune", value: "GRIMSTAD" },
    ])
  )!;
  assert.equal(p.address!.isMove, false);
  assert.equal(p.address!.kommuneChanged, true);
  assert.equal(applyAddressPatch(known, p.address!).moveType, null);
});

test("removing the whole address is not a move", () => {
  const p = parseUpdate(upd([{ op: "remove", path: "/forretningsadresse" }]))!;
  assert.equal(applyAddressPatch(known, p.address!).moveType, null);
});

test("konkurs flag uses konkursdato as the event date", () => {
  const p = parseUpdate(
    upd([
      { op: "replace", path: "/konkurs", value: true },
      { op: "add", path: "/konkursdato", value: "2026-03-09" },
    ])
  )!;
  assert.deepEqual(p.bankruptcies, [{ type: "KONKURS", eventDate: new Date("2026-03-09T00:00:00.000Z") }]);
});

test("forced dissolution falls back to the feed date; flag removal is ignored", () => {
  const p = parseUpdate(
    upd([
      { op: "replace", path: "/underTvangsavviklingEllerTvangsopplosning", value: true },
      { op: "remove", path: "/konkurs" },
    ])
  )!;
  assert.deepEqual(p.bankruptcies, [{ type: "TVANGSAVVIKLING", eventDate: new Date("2026-03-10T05:00:00.000Z") }]);
});

test("new registrations are kept (so their address can be looked up) even without details", () => {
  const p = parseUpdate({ ...upd([]), endringstype: "Ny", endringer: undefined });
  assert.equal(p?.isNew, true);
  assert.equal(p?.address, null);
});

test("updates without change details are skipped", () => {
  assert.equal(parseUpdate({ ...upd([]), endringer: undefined }), null);
  assert.equal(parseUpdate(upd([{ op: "replace", path: "/hjemmeside", value: "x.no" }])), null);
});

// --- snapshot helpers -------------------------------------------------------
import { Readable } from "node:stream";
import { jsonArrayObjects, parseBrregTimestamp } from "../lib/registry/snapshot";

test("Brreg's Java-style Last-Modified is parsed with its zone", () => {
  assert.equal(parseBrregTimestamp("Tue Nov 24 04:28:06 CET 2026")?.toISOString(), "2026-11-24T03:28:06.000Z");
  assert.equal(parseBrregTimestamp("Mon Jun 01 04:00:00 CEST 2026")?.toISOString(), "2026-06-01T02:00:00.000Z");
  assert.equal(parseBrregTimestamp("Tue, 24 Nov 2026 03:28:06 GMT")?.toISOString(), "2026-11-24T03:28:06.000Z");
  assert.equal(parseBrregTimestamp("Tue Nov 24 04:28:06 XYZ 2026"), null);
  assert.equal(parseBrregTimestamp(null), null);
});

test("streamed JSON array is split into objects across chunk boundaries", async () => {
  const doc = JSON.stringify([
    { a: 1, s: 'brace } and [ in "string"', nested: { x: [1, { y: 2 }] } },
    { b: "\\\" escaped" },
    { c: [] },
  ]);
  // feed it one character at a time to exercise every boundary
  const chunks = Readable.from(doc.split("").map((c) => Buffer.from(c)));
  const out: unknown[] = [];
  for await (const o of jsonArrayObjects(chunks)) out.push(o);
  assert.deepEqual(out, JSON.parse(doc));
});
