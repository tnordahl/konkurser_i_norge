import type { PrismaClient } from "@prisma/client";
import { calendarDaysBetween } from "./queries";
import { joinLines } from "./parse";
import type { BrregAddress } from "./types";

interface BrregEntity {
  organisasjonsnummer: string;
  navn?: string;
  organisasjonsform?: { kode?: string; beskrivelse?: string };
  registreringsdatoEnhetsregisteret?: string;
  slettedato?: string;
  konkurs?: boolean;
  konkursdato?: string;
  underAvvikling?: boolean;
  underTvangsavviklingEllerTvangsopplosning?: boolean;
  naeringskode1?: { beskrivelse?: string };
  forretningsadresse?: BrregAddress;
  postadresse?: BrregAddress;
  historiskeNavn?: { navn?: string; fraDato?: string; tilDato?: string }[];
}

const fmtAddress = (a?: BrregAddress) =>
  a ? [joinLines(a.adresse ?? []), [a.postnummer, a.poststed].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null : null;

/** Everything we know about one company: live Brreg data plus recorded moves and bankruptcy events. */
export async function getCompany(prisma: PrismaClient, orgnr: string) {
  const [state, moves, events, live, archived] = await Promise.all([
    prisma.registryAddressState.findUnique({ where: { organizationNumber: orgnr } }),
    prisma.addressMove.findMany({ where: { organizationNumber: orgnr }, orderBy: { changedAt: "asc" } }),
    prisma.bankruptcyEvent.findMany({ where: { organizationNumber: orgnr }, orderBy: { eventDate: "asc" } }),
    fetch(`https://data.brreg.no/enhetsregisteret/api/enheter/${orgnr}`, { headers: { Accept: "application/json" } })
      .then((r) => (r.ok ? (r.json() as Promise<BrregEntity>) : null))
      .catch(() => null),
    prisma.archivedCompanyPeriod.findMany({
      where: { organizationNumber: orgnr },
      orderBy: { firstSeen: "asc" },
    }),
  ]);
  if (!state && !moves.length && !events.length && !live && !archived.length) return null;

  const firstBankruptcy = events.find((e) => e.eventType === "KONKURS" || e.eventType === "TVANGSAVVIKLING") ?? null;
  return {
    company: {
      organizationNumber: orgnr,
      name: live?.navn ?? state?.name ?? moves.at(-1)?.companyName ?? events[0]?.companyName ?? archived.at(-1)?.name ?? null,
      formerNames: (live?.historiskeNavn ?? []).map((h) => ({
        name: h.navn ?? "",
        to: h.tilDato?.slice(0, 10) ?? null,
      })),
      form: live?.organisasjonsform?.beskrivelse ?? null,
      industry: live?.naeringskode1?.beskrivelse ?? null,
      registered: live?.registreringsdatoEnhetsregisteret ?? null,
      deleted: live?.slettedato ?? null,
      businessAddress: fmtAddress(live?.forretningsadresse) ?? state?.address ?? null,
      kommune: live?.forretningsadresse?.kommune ?? state?.kommuneName ?? null,
      kommuneNumber: live?.forretningsadresse?.kommunenummer ?? state?.kommuneNumber ?? null,
      postalAddress: fmtAddress(live?.postadresse),
      status: {
        konkurs: !!live?.konkurs,
        konkursdato: live?.konkursdato ?? null,
        tvangsavvikling: !!live?.underTvangsavviklingEllerTvangsopplosning,
        avvikling: !!live?.underAvvikling,
      },
      liveDataAvailable: !!live,
    },
    events: events.map((e) => ({ eventType: e.eventType, eventDate: e.eventDate, registeredAt: e.registeredAt })),
    /** Registered data per stretch of archived snapshots (2019–2026); changes are dated to an interval. */
    archived: archived.map((a) => ({
      firstSeen: a.firstSeen,
      lastSeen: a.lastSeen,
      nextSeen: a.nextSeen,
      goneAfter: a.goneAfter,
      name: a.name,
      address: [a.address, [a.postalCode, a.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null,
      kommuneName: a.kommuneName,
      postAddress: a.postAddress,
      konkurs: a.konkurs,
      konkursdato: a.konkursdato,
      underAvvikling: a.underAvvikling,
      tvangsavvikling: a.tvangsavvikling,
    })),
    moves: moves.map((m) => ({
      changedAt: m.changedAt,
      moveType: m.moveType,
      fromAddress: [m.fromAddress, [m.fromPostalCode, m.fromCity].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null,
      fromKommuneName: m.fromKommuneName,
      toAddress: [m.toAddress, [m.toPostalCode, m.toCity].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null,
      toKommuneName: m.toKommuneName,
      daysBeforeBankruptcy:
        firstBankruptcy && m.changedAt < firstBankruptcy.eventDate
          ? calendarDaysBetween(m.changedAt, firstBankruptcy.eventDate)
          : null,
    })),
  };
}
