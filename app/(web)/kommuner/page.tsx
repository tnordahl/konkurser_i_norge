"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, Building2, Info, MapPin, Truck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Row {
  kommuneNumber: string;
  kommuneName: string;
  companies: number;
  movesIn: number;
  movesOut: number;
  movesWithin: number;
  bankruptcies: number;
  bankruptMovers: number;
}
type SortKey = keyof Row | "net";

const fetcher = async (url: string) => {
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok || !body.success) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body;
};
const nb = (n: number) => n.toLocaleString("nb-NO");
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("nb-NO", { day: "2-digit", month: "short", year: "numeric" });

const COLUMNS: { key: SortKey; label: string; title?: string }[] = [
  { key: "companies", label: "Selskaper", title: "Enheter med forretningsadresse i kommunen nå" },
  { key: "movesIn", label: "Flyttet inn", title: "Flyttinger fra en annen kommune" },
  { key: "movesOut", label: "Flyttet ut", title: "Flyttinger til en annen kommune (der opprinnelsen er kjent)" },
  { key: "net", label: "Netto", title: "Inn minus ut" },
  { key: "movesWithin", label: "Internt", title: "Ny gateadresse eller nytt postnummer i kommunen" },
  { key: "bankruptcies", label: "Konkurser", title: "Konkurs eller tvangsavvikling, plassert i kommunen selskapet var registrert i da" },
  { key: "bankruptMovers", label: "Flyttet før konkurs", title: "Konkursselskaper som flyttet inn/ut/internt i året før konkursen" },
];

function KommunerInner() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [days, setDays] = useState(sp.get("days") ?? "365");
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [sort, setSort] = useState<SortKey>((sp.get("sort") as SortKey) ?? "bankruptMovers");
  const [order, setOrder] = useState<"asc" | "desc">(sp.get("order") === "asc" ? "asc" : "desc");

  useEffect(() => {
    const p = new URLSearchParams({ days, sort, order });
    if (q) p.set("q", q);
    router.replace(`${pathname}?${p}`, { scroll: false });
  }, [days, q, sort, order, pathname, router]);

  const { data, error, isLoading } = useSWR(`/api/registry/kommuner?days=${days}`, fetcher, { keepPreviousData: true });
  const all: Row[] = useMemo(() => data?.kommuner ?? [], [data]);

  // A 4-digit number that isn't a kommunenummer is treated as a postcode ("4950" → Risør).
  const trimmed = q.trim();
  const looksLikePostcode = /^\d{4}$/.test(trimmed) && all.length > 0 && !all.some((r) => r.kommuneNumber === trimmed);
  const { data: lookup } = useSWR(
    looksLikePostcode ? `/api/registry/kommune-lookup?q=${trimmed}` : null,
    fetcher,
    { revalidateOnFocus: false }
  );
  const postcodeKommune: string | null = looksLikePostcode && lookup?.match ? lookup.match.kommuneNumber : null;

  const rows = useMemo(() => {
    const needle = trimmed.toLocaleUpperCase("nb");
    const filtered = postcodeKommune
      ? all.filter((r) => r.kommuneNumber === postcodeKommune)
      : needle
        ? all.filter((r) => r.kommuneName.toLocaleUpperCase("nb").includes(needle) || r.kommuneNumber.startsWith(needle))
        : all;
    const val = (r: Row) => (sort === "net" ? r.movesIn - r.movesOut : r[sort]);
    return [...filtered].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      const c = typeof va === "string" ? va.localeCompare(vb as string, "nb") : (va as number) - (vb as number);
      return order === "asc" ? c : -c;
    });
  }, [all, trimmed, postcodeKommune, sort, order]);

  const total = (f: keyof Row) => all.reduce((s, r) => s + (r[f] as number), 0);
  const onSort = (k: SortKey) => {
    if (k === sort) setOrder((o) => (o === "asc" ? "desc" : "asc"));
    else {
      setSort(k);
      setOrder(k === "kommuneName" ? "asc" : "desc");
    }
  };
  const link = (r: Row, tab: "moves" | "bankrupt", extra = "") =>
    `/flytting?tab=${tab}&kommune=${r.kommuneNumber}&days=${Math.min(Number(days), 1000)}${extra}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <MapPin className="w-6 h-6" /> Kommuner
        </h1>
        <p className="text-gray-600 mt-1">
          Flyttinger og konkurser per kommune, fra Brønnøysundregistrene. Klikk et tall for å se selskapene.
        </p>
      </div>

      {data?.coverage && (
        <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          <Info className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            Flyttinger og konkurser registrert fra {fmtDate(data.coverage.feedStart)}
            {data.coverage.lastUpdateAt ? ` til ${fmtDate(data.coverage.lastUpdateAt)}` : ""}. «Flyttet ut» teller bare
            flyttinger der opprinnelsen er kjent.
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={<Building2 className="w-5 h-5 text-blue-600" />} label="Selskaper (nå)" value={total("companies")} />
        <Stat
          icon={<Truck className="w-5 h-5 text-amber-600" />}
          label="Flyttinger mellom kommuner"
          value={total("movesIn")}
        />
        <Stat icon={<AlertTriangle className="w-5 h-5 text-red-600" />} label="Konkurser" value={total("bankruptcies")} />
        <Stat
          icon={<AlertTriangle className="w-5 h-5 text-red-700" />}
          label="Flyttet før konkurs"
          value={data?.bankruptMoversNationwide ?? 0}
          note="Konkursselskaper som endret adresse i året før konkursen (hele landet)"
        />
      </div>

      <Card>
        <CardContent className="pt-6 flex flex-wrap items-end gap-4 text-sm">
          <label>
            <span className="block text-gray-600 mb-1">Søk kommune</span>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Navn, kommunenr. eller postnr." className="w-56" />
            {postcodeKommune && lookup?.match && (
              <span className="block text-xs text-gray-600 mt-1">
                {trimmed} er et postnummer – viser {lookup.match.kommuneName} ({lookup.match.kommuneNumber}).
              </span>
            )}
            {looksLikePostcode && lookup && !lookup.match && (
              <span className="block text-xs text-amber-700 mt-1">Fant ingen kommune for {trimmed}.</span>
            )}
          </label>
          <label>
            <span className="block text-gray-600 mb-1">Periode</span>
            <select
              value={days}
              onChange={(e) => setDays(e.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="30">Siste 30 dager</option>
              <option value="90">Siste 90 dager</option>
              <option value="365">Siste 12 måneder</option>
              <option value="2000">Alt (fra aug. 2025)</option>
            </select>
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{data ? `${rows.length} kommuner` : "Kommuner"}</CardTitle>
        </CardHeader>
        <CardContent>
          {error ? (
            <p className="text-sm text-red-700">Kunne ikke hente data: {error.message}</p>
          ) : isLoading && !data ? (
            <p className="text-sm text-gray-500">Laster…</p>
          ) : !rows.length ? (
            <p className="text-sm text-gray-500">Ingen kommuner passer søket.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortHead label="Kommune" k="kommuneName" sort={sort} order={order} onSort={onSort} />
                  {COLUMNS.map((c) => (
                    <SortHead key={c.key} label={c.label} title={c.title} k={c.key} sort={sort} order={order} onSort={onSort} right />
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const net = r.movesIn - r.movesOut;
                  return (
                    <TableRow key={r.kommuneNumber}>
                      <TableCell>
                        <Link href={link(r, "moves")} className="font-medium text-blue-700 hover:underline">
                          {r.kommuneName}
                        </Link>
                        <div className="text-xs text-gray-500">{r.kommuneNumber}</div>
                      </TableCell>
                      <Num v={r.companies} />
                      <Num v={r.movesIn} href={link(r, "moves", "&direction=in&filter=cross")} />
                      <Num v={r.movesOut} href={link(r, "moves", "&direction=out&filter=cross")} />
                      <TableCell className={`text-right tabular-nums ${net > 0 ? "text-green-700" : net < 0 ? "text-red-700" : "text-gray-400"}`}>
                        {net > 0 ? `+${nb(net)}` : nb(net)}
                      </TableCell>
                      <Num v={r.movesWithin} href={link(r, "moves", "&direction=within")} />
                      <Num v={r.bankruptcies} />
                      <Num v={r.bankruptMovers} href={link(r, "bankrupt")} strong />
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ icon, label, value, note }: { icon: React.ReactNode; label: string; value: number; note?: string }) {
  return (
    <Card>
      <CardContent className="pt-6 flex items-center gap-3" title={note}>
        {icon}
        <div>
          <div className="text-2xl font-bold tabular-nums">{nb(value)}</div>
          <div className="text-sm text-gray-600">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function Num({ v, href, strong }: { v: number; href?: string; strong?: boolean }) {
  const cls = `tabular-nums ${v === 0 ? "text-gray-300" : strong ? "font-semibold text-red-700" : ""}`;
  return (
    <TableCell className="text-right">
      {href && v > 0 ? (
        <Link href={href} className={`${cls} hover:underline`}>
          {nb(v)}
        </Link>
      ) : (
        <span className={cls}>{nb(v)}</span>
      )}
    </TableCell>
  );
}

function SortHead({
  label,
  title,
  k,
  sort,
  order,
  onSort,
  right,
}: {
  label: string;
  title?: string;
  k: SortKey;
  sort: SortKey;
  order: "asc" | "desc";
  onSort: (k: SortKey) => void;
  right?: boolean;
}) {
  const active = sort === k;
  const Icon = !active ? ArrowUpDown : order === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead className={right ? "text-right" : undefined} title={title}>
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

export default function KommunerPage() {
  return (
    <Suspense fallback={<p className="text-sm text-gray-500">Laster…</p>}>
      <KommunerInner />
    </Suspense>
  );
}
