"use client";

import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import {
  AlertTriangle,
  Building2,
  MapPin,
  Calendar,
  TrendingUp,
  RefreshCw,
  Database,
} from "lucide-react";
import { useKommuneData } from "@/lib/hooks/use-kommune-data";
import { getKommuneInfo } from "@/lib/data-fetcher";
import { useState } from "react";

// No mock data - system only works with real data from APIs

function AlertCard({ bankruptcy }: { bankruptcy: any }) {
  if (!bankruptcy.hasRecentAddressChange) return null;

  // Get the most recent previous address
  const previousAddress =
    bankruptcy.previousAddresses && bankruptcy.previousAddresses.length > 0
      ? bankruptcy.previousAddresses[bankruptcy.previousAddresses.length - 1]
      : null;

  return (
    <Card className="border-red-200 bg-red-50">
      <CardContent className="py-3 px-4">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <h4 className="font-medium text-red-900 text-sm mb-1">
              Adressevarsel
            </h4>
            <p className="text-red-800 text-xs leading-tight">
              <strong>{bankruptcy.companyName}</strong> endret adresse ut av
              kommunen innen siste år før konkurs.
            </p>
            {previousAddress && (
              <p className="text-red-700 text-xs mt-1 leading-tight">
                Tidligere adresse: {previousAddress.address}
                {previousAddress.kommune && previousAddress.kommune.name && (
                  <span className="ml-1">({previousAddress.kommune.name})</span>
                )}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function BankruptciesSection({ bankruptcies }: { bankruptcies: any[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          Konkurser ({bankruptcies.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        {bankruptcies.length === 0 ? (
          <div className="text-center py-8">
            <Database className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <h3 className="font-medium text-gray-900 mb-2">
              Ingen konkursdata
            </h3>
            <p className="text-gray-500 text-sm">
              For å vise konkursdata må systemet kobles til norske
              konkursregistre via API. Klikk "Oppdater data" for å hente data.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {bankruptcies.map((bankruptcy) => (
              <div key={bankruptcy.id}>
                <AlertCard bankruptcy={bankruptcy} />
                <div className="border rounded-lg p-4 mt-2">
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-semibold">{bankruptcy.companyName}</h4>
                    <Badge variant="destructive">Konkurs</Badge>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-gray-600">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      {new Date(bankruptcy.bankruptcyDate).toLocaleDateString(
                        "nb-NO"
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <MapPin className="h-4 w-4" />
                      {bankruptcy.address}
                    </div>
                    <div>Org.nr: {bankruptcy.organizationNumber}</div>
                    <div>Bransje: {bankruptcy.industry}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AddressChangesSection({ addressChanges }: { addressChanges: any[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Adresseendringer ({addressChanges.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        {addressChanges.length === 0 ? (
          <p className="text-gray-500">Ingen adresseendringer registrert</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Selskap</TableHead>
                  <TableHead>Dato</TableHead>
                  <TableHead>Fra adresse</TableHead>
                  <TableHead>Til adresse</TableHead>
                  <TableHead>Retning</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {addressChanges.map((change) => (
                  <TableRow key={change.id}>
                    <TableCell className="font-medium">
                      {change.companyName}
                    </TableCell>
                    <TableCell>
                      {new Date(change.changeDate).toLocaleDateString("nb-NO")}
                    </TableCell>
                    <TableCell className="text-sm">
                      {change.fromAddress}
                    </TableCell>
                    <TableCell className="text-sm">
                      {change.toAddress}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          change.direction === "in" ? "default" : "secondary"
                        }
                      >
                        {change.direction === "in"
                          ? "Inn til kommune"
                          : "Ut av kommune"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function KommunePage({
  params: { id },
}: {
  params: { id: string };
}) {
  const {
    data: bankruptcies,
    error,
    isLoading,
    triggerUpdate,
  } = useKommuneData(id);
  const [isUpdating, setIsUpdating] = useState(false);
  const [dataGaps, setDataGaps] = useState<any>(null);

  // Get kommune info - use fallback since bankruptcies don't include kommune info in new structure
  const kommune = getKommuneInfo(id);
  const hasAlerts = bankruptcies.some((b: any) => b.hasRecentAddressChange);

  const handleUpdateData = async () => {
    setIsUpdating(true);
    try {
      await triggerUpdate();
    } finally {
      setIsUpdating(false);
    }
  };

  const fetchDataGaps = async () => {
    try {
      const response = await fetch(`/api/data-gaps/${id}`);
      const result = await response.json();
      if (result.success) {
        setDataGaps(result);
      }
    } catch (error) {
      console.error("Failed to fetch data gaps:", error);
    }
  };

  // Fetch data gaps on component mount
  if (!dataGaps && !isLoading) {
    fetchDataGaps();
  }

  if (error) {
    return (
      <div className="container mx-auto py-8">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              <div>
                <h3 className="font-semibold text-red-900">
                  Ingen data tilgjengelig
                </h3>
                <p className="text-red-800 text-sm">
                  Systemet er ikke koblet til datakilder. For å få tilgang til
                  konkursdata, konfigurer Postgres database og koble til norske
                  konkursregistre.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">
            {kommune.name}
            {isLoading && (
              <RefreshCw className="inline-block ml-2 h-6 w-6 animate-spin text-gray-400" />
            )}
          </h1>
          <p className="text-gray-600 mt-1">
            {kommune.county}
            {bankruptcies.length > 0 ? (
              <span className="ml-2">
                • {bankruptcies.length} konkurser registrert
              </span>
            ) : (
              <span className="ml-2 text-gray-500">
                • Ingen data tilgjengelig
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Button
            onClick={handleUpdateData}
            disabled={isUpdating || isLoading}
            variant="outline"
            size="sm"
          >
            {isUpdating ? (
              <RefreshCw className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Database className="h-4 w-4 mr-2" />
            )}
            {isUpdating ? "Oppdaterer..." : "Oppdater data"}
          </Button>
          <Link
            href="/kommuner"
            className="text-blue-600 hover:text-blue-800 hover:underline"
          >
            ← Tilbake til kommuneliste
          </Link>
        </div>
      </div>

      {/* Data Coverage Info */}
      {dataGaps && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <Database className="h-5 w-5 text-blue-600 mt-0.5" />
              <div>
                <h3 className="font-semibold text-blue-900">Datadekning</h3>
                <p className="text-blue-800 text-sm">
                  {dataGaps.statistics.coveragePercentage.toFixed(1)}% dekning
                  siste år
                  {dataGaps.statistics.totalGaps > 0 && (
                    <span className="ml-2">
                      • {dataGaps.statistics.totalGaps} hull i dataene (
                      {dataGaps.statistics.totalMissingDays} dager mangler)
                    </span>
                  )}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {hasAlerts && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              <div>
                <h3 className="font-semibold text-amber-900">
                  Adressevarsler aktive
                </h3>
                <p className="text-amber-800 text-sm">
                  Det er registrert konkurser med nylige adresseendringer ut av
                  kommunen.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Abonnér på varsler</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-x-4">
            <Button>E-post varsling</Button>
            <Button variant="outline">Web Push</Button>
          </div>
        </CardContent>
      </Card>

      <BankruptciesSection bankruptcies={bankruptcies} />

      {/* Note: Address changes would need to be implemented separately */}
      <AddressChangesSection addressChanges={[]} />
    </div>
  );
}
