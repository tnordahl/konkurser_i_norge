"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { Building2, History, MapPin, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface CompanyHit {
  organizationNumber: string;
  name: string | null;
  formerNames: string | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  kommuneName: string | null;
  moves: number;
  bankruptcy: string | null;
}
interface AddressHit {
  address: string;
  postalCode: string | null;
  city: string | null;
  kommuneName: string | null;
  companies: number;
  bankruptCompanies: number;
  sample: { organizationNumber: string; name: string | null }[];
}
interface HistoryHit {
  organizationNumber: string;
  name: string | null;
  matchedIn: "navn" | "forretningsadresse" | "postadresse";
  matchedText: string;
  firstSeen: string;
  lastSeen: string;
  everBankrupt: boolean;
}
const yearSpan = (a: string, b: string) => {
  const fa = new Date(a).getFullYear();
  const fb = new Date(b).getFullYear();
  return fa === fb ? `${fa}` : `${fa}–${fb}`;
};


const fetcher = async (url: string) => {
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok || !body.success) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body;
};

const orgFmt = (n: string) => n.replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3");

function SearchInner() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [input, setInput] = useState(sp.get("q") ?? "");

  useEffect(() => {
    router.replace(q ? `${pathname}?q=${encodeURIComponent(q)}` : pathname, { scroll: false });
  }, [q, pathname, router]);

  const { data, error, isLoading } = useSWR(
    q.length >= 2 ? `/api/search?q=${encodeURIComponent(q)}` : null,
    fetcher,
    { keepPreviousData: true }
  );
  const companies: CompanyHit[] = data?.companies ?? [];
  const addresses: AddressHit[] = data?.addresses ?? [];
  const history: HistoryHit[] = data?.history ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Search className="w-6 h-6" /> Søk
        </h1>
        <p className="text-gray-600 mt-1">
          Søk etter selskap (også tidligere navn), org.nr eller adresse (gjerne med postnummer), også i historikken 2019–2026.
        </p>
      </div>

      <form
        className="flex gap-2 max-w-2xl"
        onSubmit={(e) => {
          e.preventDefault();
          setQ(input.trim());
        }}
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="F.eks. Skomakerstuen, 997832655 eller Prestegata 7 4950"
          className="text-base"
          autoFocus
        />
        <Button type="submit">Søk</Button>
      </form>

      {error && <p className="text-sm text-red-700">{error.message}</p>}
      {isLoading && !data && <p className="text-sm text-gray-500">Søker…</p>}

      {data && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="w-4 h-4" /> Selskaper ({companies.length}
                {companies.length === 25 ? "+" : ""})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!companies.length ? (
                <p className="text-sm text-gray-400">Ingen selskaper.</p>
              ) : (
                <ul className="divide-y">
                  {companies.map((c) => {
                    const former = c.formerNames?.split(" | ").filter((n) => n.toLowerCase().includes(q.toLowerCase()));
                    return (
                      <li key={c.organizationNumber} className="py-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <Link href={`/selskap/${c.organizationNumber}`} className="font-medium text-blue-700 hover:underline">
                          {c.name ?? "Navn ukjent"}
                        </Link>
                        <span className="text-xs text-gray-500">{orgFmt(c.organizationNumber)}</span>
                        {former && former.length > 0 && (
                          <span className="text-xs text-gray-600">tidligere: {former.join(", ")}</span>
                        )}
                        <span className="text-xs text-gray-500">
                          {[c.address, [c.postalCode, c.city].filter(Boolean).join(" ")].filter(Boolean).join(", ")}
                        </span>
                        {c.bankruptcy && (
                          <Badge variant="outline" className="bg-red-50 text-red-800 border-red-200">
                            {c.bankruptcy === "KONKURS" ? "Konkurs" : "Tvangsavvikling"}
                          </Badge>
                        )}
                        {c.moves > 0 && (
                          <Badge variant="outline">
                            {c.moves} {c.moves === 1 ? "flytting" : "flyttinger"}
                          </Badge>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <History className="w-4 h-4" /> Funnet i historikken 2019–2026 ({history.length}
                {history.length === 40 ? "+" : ""})
              </CardTitle>
              <p className="text-xs text-gray-500">
                Tidligere navn, forretningsadresser og postadresser (også «c/o») fra arkiverte kopier av Enhetsregisteret.
                Årstallene viser i hvilke arkivkopier treffet finnes.
              </p>
            </CardHeader>
            <CardContent>
              {!history.length ? (
                <p className="text-sm text-gray-400">Ingen historiske treff.</p>
              ) : (
                <ul className="divide-y">
                  {history.map((h) => (
                    <li key={h.organizationNumber} className="py-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                      <Link href={`/selskap/${h.organizationNumber}`} className="font-medium text-blue-700 hover:underline">
                        {h.name ?? h.organizationNumber}
                      </Link>
                      <span className="text-xs text-gray-500">{orgFmt(h.organizationNumber)}</span>
                      <span className="text-xs text-gray-600">
                        {h.matchedIn}: {h.matchedText}
                      </span>
                      <span className="text-xs text-gray-500">{yearSpan(h.firstSeen, h.lastSeen)}</span>
                      {h.everBankrupt && (
                        <Badge variant="outline" className="bg-red-50 text-red-800 border-red-200">
                          Konkurs/tvangsavvikling
                        </Badge>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin className="w-4 h-4" /> Adresser ({addresses.length})
              </CardTitle>
              <p className="text-xs text-gray-500">Nåværende forretningsadresser. Mange selskaper på én adresse kan være et kontorfellesskap.</p>
            </CardHeader>
            <CardContent>
              {!addresses.length ? (
                <p className="text-sm text-gray-400">Ingen adresser.</p>
              ) : (
                <ul className="space-y-3">
                  {addresses.map((a, i) => (
                    <li key={i} className="text-sm">
                      <div className="font-medium">
                        {a.address}, {a.postalCode} {a.city}
                      </div>
                      <div className="text-xs text-gray-500">
                        {a.kommuneName} · {a.companies} {a.companies === 1 ? "selskap" : "selskaper"}
                        {a.bankruptCompanies > 0 && <span className="text-red-700"> · {a.bankruptCompanies} med konkurs</span>}
                      </div>
                      <div className="text-xs mt-1 flex flex-wrap gap-x-2">
                        {a.sample.map((s) => (
                          <Link key={s.organizationNumber} href={`/selskap/${s.organizationNumber}`} className="text-blue-700 hover:underline">
                            {s.name ?? s.organizationNumber}
                          </Link>
                        ))}
                        {a.companies > a.sample.length && <span className="text-gray-400">+{a.companies - a.sample.length}</span>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

        </div>
      )}
    </div>
  );
}

export default function DetectivePage() {
  return (
    <Suspense fallback={<p className="text-sm text-gray-500">Laster…</p>}>
      <SearchInner />
    </Suspense>
  );
}
