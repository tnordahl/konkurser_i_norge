"use client";

import Link from "next/link";
import useSWR from "swr";
import { ArrowLeft, Building2, ExternalLink, MoveRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface ArchivedPeriod {
  firstSeen: string;
  lastSeen: string;
  nextSeen: string | null;
  goneAfter: boolean;
  name: string | null;
  address: string | null;
  kommuneName: string | null;
  postAddress: string | null;
  konkurs: boolean;
  konkursdato: string | null;
  underAvvikling: boolean;
  tvangsavvikling: boolean;
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok || !body.success) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body;
};
const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString("nb-NO", { day: "2-digit", month: "short", year: "numeric" });
const EVENT_LABEL: Record<string, string> = { KONKURS: "Konkurs", TVANGSAVVIKLING: "Tvangsavvikling", AVVIKLING: "Avvikling" };
const MOVE_LABEL: Record<string, string> = {
  CROSS_KOMMUNE: "Ny kommune",
  NEW_POSTCODE: "Nytt postnummer",
  SAME_POSTCODE: "Ny gateadresse",
  UNKNOWN: "Adresse endret",
};

interface Connections {
  coMovers: {
    organizationNumber: string;
    name: string | null;
    changedAt: string;
    daysApart: number;
    sameFrom: boolean;
    sameTo: boolean;
    from: string | null;
    to: string | null;
    bankrupt: boolean;
  }[];
  coLocated: {
    organizationNumber: string;
    name: string | null;
    address: string;
    overlapFrom: string;
    overlapTo: string;
    bankrupt: boolean;
    deleted: boolean;
  }[];
  coLocatedTotal: number;
}

function ConnectionsCard({ connections }: { connections?: Connections }) {
  if (!connections) return null;
  const { coMovers, coLocated, coLocatedTotal } = connections;
  const shared = coLocatedTotal > 15;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Forbindelser via adresse</CardTitle>
        <p className="text-xs text-gray-500">
          Selskaper som flyttet samtidig eller holdt til på samme adresse. Et signal å undersøke videre, ikke bevis på
          sammenheng.
        </p>
      </CardHeader>
      <CardContent className="space-y-5 text-sm">
        <div>
          <div className="text-xs font-semibold text-gray-500 mb-1">Flyttet samtidig (innen 30 dager)</div>
          {coMovers.length ? (
            <ul className="space-y-1.5">
              {coMovers.map((m) => (
                <li key={m.organizationNumber} className="flex flex-wrap items-baseline gap-x-2">
                  <Link href={`/selskap/${m.organizationNumber}`} className="font-medium text-blue-700 hover:underline">
                    {m.name ?? m.organizationNumber}
                  </Link>
                  <span className="text-xs text-gray-600">
                    {fmt(m.changedAt)} ({m.daysApart === 0 ? "samme dag" : `${m.daysApart} ${m.daysApart === 1 ? "dag" : "dager"} fra hverandre`})
                    {m.sameFrom && m.sameTo ? " · samme fra- og til-sted" : m.sameFrom ? " · samme fra-adresse" : " · samme til-sted"}
                  </span>
                  <span className="text-xs text-gray-500">
                    {m.from || "?"} → {m.to || "?"}
                  </span>
                  {m.bankrupt && (
                    <Badge variant="outline" className="bg-red-50 text-red-800 border-red-200">
                      Konkurs/tvangsavvikling
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-gray-400">Ingen registrert.</span>
          )}
        </div>
        <div>
          <div className="text-xs font-semibold text-gray-500 mb-1">
            Samme forretningsadresse samtidig ({coLocatedTotal}
            {coLocatedTotal > coLocated.length ? `, viser ${coLocated.length}` : ""})
            {shared && <span className="font-normal text-amber-700"> · mange selskaper, trolig kontorfellesskap</span>}
          </div>
          {coLocated.length ? (
            <ul className="space-y-1">
              {coLocated.map((p) => (
                <li key={p.organizationNumber} className="flex flex-wrap items-baseline gap-x-2">
                  <Link href={`/selskap/${p.organizationNumber}`} className="text-blue-700 hover:underline">
                    {p.name ?? p.organizationNumber}
                  </Link>
                  <span className="text-xs text-gray-500">
                    {p.address} · {new Date(p.overlapFrom).getFullYear()}–{new Date(p.overlapTo).getFullYear()}
                  </span>
                  {p.bankrupt && (
                    <Badge variant="outline" className="bg-red-50 text-red-800 border-red-200">
                      Konkurs/tvangsavvikling
                    </Badge>
                  )}
                  {p.deleted && !p.bankrupt && <Badge variant="outline">Slettet</Badge>}
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-gray-400">Ingen i arkivkopiene.</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function CompanyPage({ params }: { params: { orgnr: string } }) {
  const { data, error, isLoading } = useSWR(`/api/registry/company/${params.orgnr}`, fetcher);
  if (isLoading) return <p className="text-sm text-gray-500">Laster…</p>;
  if (error) return <p className="text-sm text-red-700">Kunne ikke hente selskapet: {error.message}</p>;
  const { company: c, events, moves, archived, connections } = data;
  const orgnrFmt = params.orgnr.replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3");

  return (
    <div className="space-y-6">
      <Link href="/detective" className="text-sm text-blue-700 hover:underline inline-flex items-center gap-1">
        <ArrowLeft className="w-4 h-4" /> Søk
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Building2 className="w-6 h-6" /> {c.name ?? "Navn ukjent"}
        </h1>
        <div className="text-sm text-gray-600 mt-1 space-x-3">
          <span>Org.nr {orgnrFmt}</span>
          {c.form && <span>{c.form}</span>}
          {c.registered && <span>Registrert {fmt(c.registered)}</span>}
          <a
            className="text-blue-700 hover:underline inline-flex items-center gap-1"
            href={`https://virksomhet.brreg.no/nb/oppslag/enheter/${params.orgnr}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Brønnøysund <ExternalLink className="w-3 h-3" />
          </a>
        </div>
        <div className="flex flex-wrap gap-2 mt-2">
          {c.deleted && <Badge variant="outline">Slettet {fmt(c.deleted)}</Badge>}
          {c.status.konkurs && (
            <Badge variant="outline" className="bg-red-50 text-red-800 border-red-200">
              Konkurs{c.status.konkursdato ? ` ${fmt(c.status.konkursdato)}` : ""}
            </Badge>
          )}
          {c.status.tvangsavvikling && <Badge variant="outline" className="bg-red-50 text-red-800 border-red-200">Tvangsavvikling</Badge>}
          {c.status.avvikling && <Badge variant="outline">Under avvikling</Badge>}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Adresser</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <div>
              <div className="text-gray-500 text-xs">Forretningsadresse</div>
              {c.businessAddress ?? <span className="italic text-gray-400">Ukjent</span>}
              {c.kommune && <span className="text-gray-500"> · {c.kommune}</span>}
            </div>
            <div>
              <div className="text-gray-500 text-xs">Postadresse</div>
              {c.postalAddress ?? <span className="italic text-gray-400">Ingen / ukjent</span>}
            </div>
            {c.industry && (
              <div>
                <div className="text-gray-500 text-xs">Næring</div>
                {c.industry}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tidligere navn</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {c.formerNames.length ? (
              <ul className="space-y-1">
                {c.formerNames.map((n: { name: string; to: string | null }, i: number) => (
                  <li key={i}>
                    {n.name}
                    {n.to && <span className="text-gray-500"> (til {fmt(n.to)})</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <span className="text-gray-400">Ingen</span>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Konkurs og avvikling</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {events.length ? (
            <ul className="space-y-1">
              {events.map((e: { eventType: string; eventDate: string }, i: number) => (
                <li key={i}>
                  <span className="font-medium">{EVENT_LABEL[e.eventType] ?? e.eventType}</span> {fmt(e.eventDate)}
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-gray-400">Ingen registrert siden 15. aug. 2025.</span>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Adresseendringer (siden 15. aug. 2025)</CardTitle>
        </CardHeader>
        <CardContent>
          {moves.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Registrert</TableHead>
                  <TableHead>Fra</TableHead>
                  <TableHead></TableHead>
                  <TableHead>Til</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Før konkurs</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {moves.map(
                  (
                    m: {
                      changedAt: string;
                      moveType: string;
                      fromAddress: string | null;
                      fromKommuneName: string | null;
                      toAddress: string | null;
                      toKommuneName: string | null;
                      daysBeforeBankruptcy: number | null;
                    },
                    i: number
                  ) => (
                    <TableRow key={i} className="align-top text-sm">
                      <TableCell className="whitespace-nowrap">{fmt(m.changedAt)}</TableCell>
                      <TableCell>
                        <div className="font-medium">{m.fromKommuneName ?? <span className="italic text-gray-400">Ukjent</span>}</div>
                        {m.fromAddress && <div className="text-xs text-gray-500">{m.fromAddress}</div>}
                      </TableCell>
                      <TableCell>
                        <MoveRight className="w-4 h-4 text-gray-400" />
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{m.toKommuneName ?? <span className="italic text-gray-400">Kommune ukjent</span>}</div>
                        {m.toAddress && <div className="text-xs text-gray-500">{m.toAddress}</div>}
                      </TableCell>
                      <TableCell className="text-xs">{MOVE_LABEL[m.moveType] ?? m.moveType}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {m.daysBeforeBankruptcy !== null ? `${m.daysBeforeBankruptcy} dager før` : "–"}
                      </TableCell>
                    </TableRow>
                  )
                )}
              </TableBody>
            </Table>
          ) : (
            <span className="text-sm text-gray-400">Ingen registrert siden 15. aug. 2025.</span>
          )}
        </CardContent>
      </Card>


      <ConnectionsCard connections={connections} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Historikk 2019–2026 (arkiverte registerkopier)</CardTitle>
          <p className="text-xs text-gray-500">
            Fra arkiverte kopier av Enhetsregisteret. En endring er datert til perioden mellom to kopier – ikke en eksakt dato.
          </p>
        </CardHeader>
        <CardContent>
          {archived?.length ? (
            <ol className="space-y-3 text-sm">
              {archived.map((a: ArchivedPeriod, i: number) => (
                <li key={i} className="border-l-2 border-gray-200 pl-3">
                  <div className="text-xs text-gray-500">
                    Registrert slik i kopiene {fmt(a.firstSeen)}
                    {a.lastSeen !== a.firstSeen && <> – {fmt(a.lastSeen)}</>}
                  </div>
                  <div className="font-medium">{a.name}</div>
                  <div>
                    {a.address ?? <span className="italic text-gray-400">Ingen forretningsadresse</span>}
                    {a.kommuneName && <span className="text-gray-500"> · {a.kommuneName}</span>}
                  </div>
                  {a.postAddress && <div className="text-gray-600">Postadresse: {a.postAddress}</div>}
                  <div className="flex flex-wrap gap-2 mt-1">
                    {a.konkurs && (
                      <Badge variant="outline" className="bg-red-50 text-red-800 border-red-200">
                        Konkurs{a.konkursdato ? ` ${fmt(a.konkursdato)}` : ""}
                      </Badge>
                    )}
                    {a.tvangsavvikling && <Badge variant="outline" className="bg-red-50 text-red-800 border-red-200">Tvangsavvikling</Badge>}
                    {a.underAvvikling && <Badge variant="outline">Under avvikling</Badge>}
                  </div>
                  {a.nextSeen && (
                    <div className="text-xs text-amber-800 mt-1">
                      {a.goneAfter ? "Slettet" : "Endret"} mellom {fmt(a.lastSeen)} og {fmt(a.nextSeen)}
                    </div>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <span className="text-sm text-gray-400">Ikke funnet i arkiverte kopier.</span>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
