"use client";

import { Fragment, Suspense, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import useSWR from "swr";
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  Info,
  MoveRight,
  Truck,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

// ---- API shapes (see lib/registry/queries.ts) ------------------------------

interface Coverage {
  feedStart: string;
  lastUpdateAt: string | null;
  caughtUp: boolean;
}

interface Side {
  address: string | null;
  postalCode: string | null;
  city: string | null;
  kommuneNumber: string | null;
  kommuneName: string | null;
}

interface Move {
  id: string;
  organizationNumber: string;
  companyName: string | null;
  changedAt: string;
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
  /** Set when the company was later declared bankrupt / forcibly dissolved. */
  laterBankruptcy?: { eventType: "KONKURS" | "TVANGSAVVIKLING"; eventDate: string; daysAfter: number } | null;
}

interface BankruptMover {
  eventId: string;
  organizationNumber: string;
  companyName: string | null;
  eventType: "KONKURS" | "TVANGSAVVIKLING" | "AVVIKLING";
  eventDate: string;
  minDaysBefore: number;
  moves: (Omit<Move, "id" | "organizationNumber" | "companyName"> & { daysBefore: number })[];
}


type MoveType = "CROSS_KOMMUNE" | "NEW_POSTCODE" | "SAME_POSTCODE" | "UNKNOWN";

// ---- helpers ---------------------------------------------------------------

const fetcher = async (url: string) => {
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok || !body.success) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body;
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("nb-NO", { day: "2-digit", month: "short", year: "numeric" });

const MOVE_LABEL: Record<MoveType, string> = {
  CROSS_KOMMUNE: "Ny kommune",
  NEW_POSTCODE: "Nytt postnummer",
  SAME_POSTCODE: "Ny gateadresse",
  UNKNOWN: "Adresse endret",
};

const MOVE_FILTERS: Record<string, { label: string; value: string }> = {
  all: { label: "Alle adresseendringer", value: "" },
  real: { label: "Nytt postnummer eller kommune", value: "CROSS_KOMMUNE,NEW_POSTCODE" },
  cross: { label: "Kun til annen kommune", value: "CROSS_KOMMUNE" },
};

const side = (m: Omit<Move, "id" | "organizationNumber" | "companyName">, which: "from" | "to"): Side =>
  which === "from"
    ? {
        address: m.fromAddress,
        postalCode: m.fromPostalCode,
        city: m.fromCity,
        kommuneNumber: m.fromKommuneNumber,
        kommuneName: m.fromKommuneName,
      }
    : {
        address: m.toAddress,
        postalCode: m.toPostalCode,
        city: m.toCity,
        kommuneNumber: m.toKommuneNumber,
        kommuneName: m.toKommuneName,
      };

function Place({ s, unknownHint }: { s: Side; unknownHint: string }) {
  const street = [s.address, [s.postalCode, s.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  if (!street && !s.kommuneName) {
    return (
      <span className="text-gray-400 italic" title={unknownHint}>
        Ukjent
      </span>
    );
  }
  // Norwegian postcodes are exactly 4 digits; anything else is a foreign address (no kommune).
  const abroad = !s.kommuneName && !!s.postalCode && !/^\d{4}$/.test(s.postalCode);
  return (
    <div className="leading-tight">
      <div className="font-medium">
        {s.kommuneName ?? (abroad ? "Utlandet" : <span className="text-gray-400 italic">Kommune ukjent</span>)}
      </div>
      {street && <div className="text-xs text-gray-500">{street}</div>}
    </div>
  );
}

function Company({ name, orgnr }: { name: string | null; orgnr: string }) {
  return (
    <div className="leading-tight">
      <div className="font-medium">{name ?? <span className="text-gray-400 italic">Navn ukjent</span>}</div>
      <a
        href={`https://virksomhet.brreg.no/nb/oppslag/enheter/${orgnr}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-blue-600 hover:underline"
      >
        {orgnr.replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3")}
      </a>
    </div>
  );
}

function MoveBadge({ t }: { t: MoveType }) {
  const cls =
    t === "CROSS_KOMMUNE"
      ? "bg-red-100 text-red-800 border-red-200"
      : t === "NEW_POSTCODE"
        ? "bg-amber-100 text-amber-800 border-amber-200"
        : "bg-gray-100 text-gray-700 border-gray-200";
  return (
    <Badge variant="outline" className={cls}>
      {MOVE_LABEL[t]}
    </Badge>
  );
}

type SortKey = "eventDate" | "daysBefore" | "name";
const parseSort = (v: string | null): SortKey => (v === "daysBefore" || v === "name" ? v : "eventDate");
// First click: closest move first, A–Å, newest bankruptcy first.
const DEFAULT_ORDER: Record<SortKey, "asc" | "desc"> = { daysBefore: "asc", name: "asc", eventDate: "desc" };

function SortHead({
  label,
  k,
  sort,
  order,
  onSort,
  className,
}: {
  label: string;
  k: SortKey;
  sort: SortKey;
  order: "asc" | "desc";
  onSort: (k: SortKey) => void;
  className?: string;
}) {
  const active = sort === k;
  const Icon = !active ? ArrowUpDown : order === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead className={className} aria-sort={active ? (order === "asc" ? "ascending" : "descending") : "none"}>
      <button
        onClick={() => onSort(k)}
        className={`inline-flex items-center gap-1 whitespace-nowrap hover:text-gray-900 ${active ? "text-gray-900 font-semibold" : ""}`}
      >
        {label}
        <Icon className={`w-3.5 h-3.5 ${active ? "" : "opacity-40"}`} />
      </button>
    </TableHead>
  );
}

interface KommuneRef {
  kommuneNumber: string;
  kommuneName: string;
}

/**
 * Accepts a kommune name, a kommunenummer or a postnummer (e.g. "Risør",
 * "4201" or "4950") and always says which kommune is being shown.
 */
function KommuneFilter({ kommune, onChange }: { kommune: string; onChange: (k: string) => void }) {
  const { data: all } = useSWR<{ kommuner: KommuneRef[] }>("/api/registry/kommune-lookup", fetcher, {
    revalidateOnFocus: false,
  });
  const current = all?.kommuner.find((k) => k.kommuneNumber === kommune);
  const [input, setInput] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<KommuneRef[]>([]);
  const [busy, setBusy] = useState(false);

  // Show the name when the kommune comes from the URL.
  useEffect(() => {
    if (current) setInput((v) => (v === "" || v === current.kommuneNumber ? current.kommuneName : v));
  }, [current]);

  const choose = (k: KommuneRef, why?: string) => {
    onChange(k.kommuneNumber);
    setInput(k.kommuneName);
    setCandidates([]);
    setNote(why ?? null);
  };

  const submit = async () => {
    const v = input.trim();
    if (!v) {
      onChange("");
      setNote(null);
      setCandidates([]);
      return;
    }
    setBusy(true);
    try {
      const d = await fetcher(`/api/registry/kommune-lookup?q=${encodeURIComponent(v)}`);
      if (d.match) {
        choose(
          d.match,
          d.matchedBy === "postnummer" ? `${v} er et postnummer – viser kommunen ${d.match.kommuneName}.` : undefined
        );
      } else {
        setCandidates(d.candidates ?? []);
        setNote(d.candidates?.length ? "Flere kommuner passer – velg én:" : `Fant ingen kommune for «${v}».`);
      }
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Oppslaget feilet");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="text-sm">
      <span className="block text-gray-600 mb-1">Kommune</span>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Hele landet"
          list="kommune-liste"
          className="w-48"
          aria-label="Kommunenavn, kommunenummer eller postnummer"
        />
        <datalist id="kommune-liste">
          {all?.kommuner.map((k) => <option key={k.kommuneNumber} value={k.kommuneName} />)}
        </datalist>
        <Button type="submit" variant="outline" disabled={busy}>
          Vis
        </Button>
        {kommune && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              onChange("");
              setInput("");
              setNote(null);
              setCandidates([]);
            }}
          >
            Nullstill
          </Button>
        )}
      </form>
      <div className="mt-1 text-xs text-gray-600 max-w-xs">
        {kommune ? (
          <>Viser {current ? `${current.kommuneName} (kommunenr. ${kommune})` : `kommunenr. ${kommune}`}. </>
        ) : (
          <>Navn, kommunenr. eller postnr. </>
        )}
        {note && <span className={candidates.length || !kommune ? "text-amber-800" : ""}>{note}</span>}
        {candidates.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {candidates.map((k) => (
              <button
                key={k.kommuneNumber}
                type="button"
                onClick={() => choose(k)}
                className="rounded border px-2 py-0.5 hover:bg-gray-50"
              >
                {k.kommuneName}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** "12 dager før" / "1 dag etter" — red within 30 days, amber within 90. */
function DaysPill({ days, suffix, title }: { days: number; suffix: string; title?: string }) {
  const cls =
    days <= 30
      ? "bg-red-100 text-red-800 border-red-200"
      : days <= 90
        ? "bg-amber-100 text-amber-800 border-amber-200"
        : "bg-gray-100 text-gray-700 border-gray-200";
  return (
    <span
      title={title}
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap tabular-nums ${cls}`}
    >
      {days} {days === 1 ? "dag" : "dager"} {suffix}
    </span>
  );
}

const UNKNOWN_FROM =
  "Forrige adresse er ikke kjent: selskapet hadde ingen registrert adresseendring siden datagrunnlaget startet.";

// ---- page ------------------------------------------------------------------

function FlyttingInner() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const [tab, setTab] = useState<"bankrupt" | "moves">(sp.get("tab") === "moves" ? "moves" : "bankrupt");
  const [kommune, setKommune] = useState(sp.get("kommune") ?? "");
  const [days, setDays] = useState(sp.get("days") ?? "90");
  const [windowDays, setWindowDays] = useState(sp.get("window") ?? "365");
  const [moveFilter, setMoveFilter] = useState(sp.get("filter") ?? "all");
  const [direction, setDirection] = useState(sp.get("direction") ?? "any");
  const [sort, setSort] = useState<SortKey>(parseSort(sp.get("sort")));
  const [order, setOrder] = useState<"asc" | "desc">(sp.get("order") === "asc" ? "asc" : "desc");
  const [limit, setLimit] = useState(100);

  const onSort = (key: SortKey) => {
    if (key === sort) setOrder((o) => (o === "asc" ? "desc" : "asc"));
    else {
      setSort(key);
      setOrder(DEFAULT_ORDER[key]);
    }
  };

  // Keep the URL shareable.
  useEffect(() => {
    const q = new URLSearchParams({ tab, days, window: windowDays, filter: moveFilter, direction, sort, order });
    if (kommune) q.set("kommune", kommune);
    router.replace(`${pathname}?${q}`, { scroll: false });
  }, [tab, kommune, days, windowDays, moveFilter, direction, sort, order, pathname, router]);

  useEffect(() => setLimit(100), [tab, kommune, days, windowDays, moveFilter, direction, sort, order]);

  const base = new URLSearchParams({ days, limit: String(limit) });
  if (kommune) base.set("kommune", kommune);
  if (MOVE_FILTERS[moveFilter]?.value) base.set("moveTypes", MOVE_FILTERS[moveFilter].value);

  const bankruptUrl = `/api/registry/bankrupt-movers?${base}&window=${windowDays}&sort=${sort}&order=${order}`;
  const movesUrl = `/api/registry/moves?${base}&direction=${direction}`;
  const { data, error, isLoading } = useSWR(tab === "bankrupt" ? bankruptUrl : movesUrl, fetcher, {
    keepPreviousData: true,
  });
  const coverage: Coverage | undefined = data?.coverage;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Truck className="w-6 h-6" /> Flytting og konkurs
        </h1>
        <p className="text-gray-600 mt-1">
          Hvem endret forretningsadresse før de gikk konkurs, og hvem flytter nå. Kun registrerte endringer fra
          Brønnøysundregistrene.
        </p>
      </div>

      {coverage && (
        <div
          className={`flex items-start gap-2 rounded-md border p-3 text-sm ${
            coverage.caughtUp ? "border-blue-200 bg-blue-50 text-blue-900" : "border-amber-200 bg-amber-50 text-amber-900"
          }`}
        >
          {coverage.caughtUp ? <Info className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />}
          <div>
            {coverage.lastUpdateAt ? (
              <>
                Datagrunnlag: {fmtDate(coverage.feedStart)} – {fmtDate(coverage.lastUpdateAt)}. Adresseendringer før{" "}
                {fmtDate(coverage.feedStart)} finnes ikke i Brønnøysundregistrenes åpne data og vises ikke.
                {!coverage.caughtUp && " Innhentingen er ikke à jour ennå, så nyere endringer mangler."}
              </>
            ) : (
              <>Ingen data hentet ennå. Kjør innhentingen (scripts/registry-sync.ts) først.</>
            )}
          </div>
        </div>
      )}

      <div className="flex gap-2 border-b">
        {(
          [
            ["bankrupt", "Flyttet før konkurs"],
            ["moves", "Alle adresseendringer"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === key ? "border-blue-600 text-blue-700" : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="pt-6 flex flex-wrap items-end gap-4">
          <KommuneFilter kommune={kommune} onChange={setKommune} />

          <Select
            label={tab === "bankrupt" ? "Konkurs siste" : "Endret siste"}
            value={days}
            onChange={setDays}
            options={[
              ["7", "7 dager"],
              ["30", "30 dager"],
              ["90", "90 dager"],
              ["365", "12 måneder"],
              ["1000", "Alt"],
            ]}
          />

          {tab === "bankrupt" && (
            <Select
              label="Flyttet inntil"
              value={windowDays}
              onChange={setWindowDays}
              options={[
                ["30", "30 dager før"],
                ["90", "90 dager før"],
                ["180", "6 mnd før"],
                ["365", "12 mnd før"],
              ]}
            />
          )}

          <Select
            label="Type endring"
            value={moveFilter}
            onChange={setMoveFilter}
            options={Object.entries(MOVE_FILTERS).map(([k, v]) => [k, v.label])}
          />

          {tab === "moves" && kommune && (
            <Select
              label="Retning"
              value={direction}
              onChange={setDirection}
              options={[
                ["any", "Inn, ut og internt"],
                ["in", "Flyttet inn"],
                ["out", "Flyttet ut"],
                ["within", "Internt i kommunen"],
              ]}
            />
          )}
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          Kunne ikke hente data: {error.message}
        </div>
      )}

      {tab === "bankrupt" ? (
        <BankruptTable rows={data?.companies} loading={isLoading} sort={sort} order={order} onSort={onSort} />
      ) : (
        <MovesTable
          rows={data?.moves}
          total={data?.total}
          unknownOrigin={data?.unknownOrigin}
          loading={isLoading}
          showOutNote={!!kommune && (direction === "out" || direction === "any")}
        />
      )}

      {data && (data.moves?.length ?? data.companies?.length ?? 0) >= limit && (
        <div className="text-center">
          <Button variant="outline" onClick={() => setLimit((l) => Math.min(l + 100, 500))} disabled={limit >= 500}>
            {limit >= 500 ? "Maks 500 rader – snevre inn filteret" : "Vis flere"}
          </Button>
        </div>
      )}
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: (readonly [string, string])[] | [string, string][];
}) {
  return (
    <label className="text-sm">
      <span className="block text-gray-600 mb-1">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

function BankruptTable({
  rows,
  loading,
  sort,
  order,
  onSort,
}: {
  rows?: BankruptMover[];
  loading: boolean;
  sort: SortKey;
  order: "asc" | "desc";
  onSort: (k: SortKey) => void;
}) {
  const head = { sort, order, onSort };
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          {rows ? `${rows.length} selskaper flyttet før konkurs` : "Selskaper som flyttet før konkurs"}
        </CardTitle>
        <p className="text-sm text-gray-500">Klikk en rad for alle adresseendringer, eller navnet for selskapssiden.</p>
      </CardHeader>
      <CardContent>
        {loading && !rows ? (
          <p className="text-gray-500 text-sm">Laster…</p>
        ) : !rows?.length ? (
          <p className="text-gray-500 text-sm">Ingen treff for dette filteret i datagrunnlaget.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-6"></TableHead>
                <SortHead label="Selskap" k="name" {...head} />
                <SortHead label="Konkurs" k="eventDate" {...head} />
                <SortHead label="Dager før" k="daysBefore" {...head} className="text-right" />
                <TableHead>Siste adresseendring før konkurs</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const isOpen = open.has(r.eventId);
                const last = r.moves[r.moves.length - 1];
                return (
                  <Fragment key={r.eventId}>
                    <TableRow className="cursor-pointer align-middle" onClick={() => toggle(r.eventId)}>
                      <TableCell className="text-gray-400">
                        {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </TableCell>
                      <TableCell className="min-w-[12rem]">
                        <Link
                          href={`/selskap/${r.organizationNumber}`}
                          onClick={(e) => e.stopPropagation()}
                          className="font-medium hover:underline"
                        >
                          {r.companyName ?? <span className="italic text-gray-400">Navn ukjent</span>}
                        </Link>
                        <div className="text-xs text-gray-500">
                          {r.organizationNumber.replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3")}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <div className="font-medium">{fmtDate(r.eventDate)}</div>
                        {r.eventType !== "KONKURS" && (
                          <div className="text-xs text-gray-500">
                            {r.eventType === "TVANGSAVVIKLING" ? "Tvangsavvikling" : "Avvikling"}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap font-semibold tabular-nums">{r.minDaysBefore}</TableCell>
                      <TableCell className="text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-gray-500 whitespace-nowrap">{fmtDate(last.changedAt)}</span>
                          <span className="font-medium">{last.fromKommuneName ?? <span className="italic text-gray-400">Ukjent</span>}</span>
                          <MoveRight className="w-4 h-4 text-gray-400" />
                          <span className="font-medium">
                            {last.toKommuneName ?? <span className="italic text-gray-400">Ukjent</span>}
                          </span>
                          <MoveBadge t={last.moveType} />
                          {r.moves.length > 1 && <span className="text-xs text-gray-500">+{r.moves.length - 1} flere</span>}
                        </div>
                      </TableCell>
                    </TableRow>
                    {isOpen && (
                      <TableRow className="bg-gray-50/60 hover:bg-gray-50/60">
                        <TableCell></TableCell>
                        <TableCell colSpan={4} className="py-4">
                          <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
                            <div>
                              <div className="text-xs font-semibold text-gray-500 mb-2">Adresseendringer før konkurs</div>
                              <div className="grid grid-cols-[auto_auto_minmax(6rem,max-content)_auto_minmax(8rem,1fr)_auto] items-start gap-x-3 gap-y-3 text-sm">
                                {r.moves.map((m, i) => (
                                  <div key={i} className="contents">
                                    <span className="text-gray-500 whitespace-nowrap">{fmtDate(m.changedAt)}</span>
                                    <span>
                                      <DaysPill days={m.daysBefore} suffix="før" />
                                    </span>
                                    <Place s={side(m, "from")} unknownHint={UNKNOWN_FROM} />
                                    <MoveRight className="w-4 h-4 text-gray-400 mt-0.5" />
                                    <Place s={side(m, "to")} unknownHint="Ny adresse ikke kjent" />
                                    <MoveBadge t={m.moveType} />
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function MovesTable({
  rows,
  total,
  unknownOrigin,
  loading,
  showOutNote,
}: {
  rows?: Move[];
  total?: number;
  unknownOrigin?: number;
  loading: boolean;
  showOutNote: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          {total !== undefined ? `${total.toLocaleString("nb-NO")} adresseendringer` : "Adresseendringer"}
        </CardTitle>
        {showOutNote && !!unknownOrigin && (
          <p className="text-sm text-amber-800 flex items-center gap-1">
            <AlertTriangle className="w-4 h-4" />
            {unknownOrigin.toLocaleString("nb-NO")} flyttinger til andre kommuner har ukjent opprinnelse og kan derfor ikke
            knyttes til denne kommunen som «flyttet ut».
          </p>
        )}
      </CardHeader>
      <CardContent>
        {loading && !rows ? (
          <p className="text-gray-500 text-sm">Laster…</p>
        ) : !rows?.length ? (
          <p className="text-gray-500 text-sm">Ingen adresseendringer for dette filteret i datagrunnlaget.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Registrert</TableHead>
                <TableHead>Selskap</TableHead>
                <TableHead>Fra</TableHead>
                <TableHead></TableHead>
                <TableHead>Til</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Konkurs</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((m) => (
                <TableRow key={m.id} className="align-top">
                  <TableCell className="whitespace-nowrap text-sm">{fmtDate(m.changedAt)}</TableCell>
                  <TableCell>
                    <Company name={m.companyName} orgnr={m.organizationNumber} />
                  </TableCell>
                  <TableCell className="text-sm">
                    <Place s={side(m, "from")} unknownHint={UNKNOWN_FROM} />
                  </TableCell>
                  <TableCell>
                    <ArrowRight className="w-4 h-4 text-gray-400" />
                  </TableCell>
                  <TableCell className="text-sm">
                    <Place s={side(m, "to")} unknownHint="Ny adresse ikke kjent" />
                  </TableCell>
                  <TableCell>
                    <MoveBadge t={m.moveType} />
                  </TableCell>
                  <TableCell className="text-sm">
                    {m.laterBankruptcy ? (
                      <div className="leading-tight space-y-0.5">
                        <DaysPill
                          days={m.laterBankruptcy.daysAfter}
                          suffix="etter"
                          title="Dager fra adresseendringen til konkursdato"
                        />
                        <div className="text-xs text-gray-500 whitespace-nowrap">
                          {m.laterBankruptcy.eventType === "KONKURS" ? "Konkurs" : "Tvangsavvikling"}{" "}
                          {fmtDate(m.laterBankruptcy.eventDate)}
                        </div>
                      </div>
                    ) : (
                      <span className="text-gray-300">–</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export default function FlyttingPage() {
  return (
    <Suspense fallback={<p className="text-gray-500 text-sm">Laster…</p>}>
      <FlyttingInner />
    </Suspense>
  );
}
