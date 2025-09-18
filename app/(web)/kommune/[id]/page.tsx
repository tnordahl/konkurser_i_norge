"use client";

import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
  Shield,
  Eye,
  Target,
  Users,
  Search,
} from "lucide-react";
import { useKommuneData } from "@/lib/hooks/use-kommune-data";
import { getKommuneInfo } from "@/lib/data-fetcher";
import { useState, useEffect } from "react";
import useSWR from "swr";

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

// Comprehensive Fraud Monitoring Component
function FraudMonitoringSection({ kommuneNumber }: { kommuneNumber: string }) {
  const fetcher = async (url: string) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Failed to fetch");
    return response.json();
  };

  const {
    data: comprehensiveData,
    error: comprehensiveError,
    isLoading: comprehensiveLoading,
    mutate: refreshComprehensive,
  } = useSWR(`/api/comprehensive-monitoring/${kommuneNumber}`, fetcher, {
    refreshInterval: 60000, // Refresh every 1 minute for responsiveness
    dedupingInterval: 30000, // Cache for 30 seconds
    revalidateOnFocus: true, // Refresh when user returns to tab
    revalidateOnReconnect: false, // Don't refresh on network reconnect
    errorRetryCount: 2, // Fewer retries for faster feedback
    errorRetryInterval: 2000, // 2 second retry interval
  });

  const {
    data: addressScanData,
    error: addressScanError,
    isLoading: addressScanLoading,
    mutate: refreshAddressScan,
  } = useSWR(`/api/address-change-scanner?kommune=${kommuneNumber}`, fetcher, {
    refreshInterval: 120000, // Refresh every 2 minutes (heavier operation)
    dedupingInterval: 60000, // Cache for 1 minute
    revalidateOnFocus: true, // Refresh when user returns to tab
    revalidateOnReconnect: false, // Don't refresh on network reconnect
    errorRetryCount: 2, // Fewer retries for faster feedback
    errorRetryInterval: 3000, // 3 second retry interval
  });

  if (comprehensiveLoading || addressScanLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Svindelovervåking
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-gray-500">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Analyserer svindelmønstre...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (comprehensiveError || addressScanError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Svindelovervåking
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-500">Kunne ikke laste svindeldata</p>
        </CardContent>
      </Card>
    );
  }

  const fraudRiskLevel = comprehensiveData?.summary?.fraudRiskLevel || "LOW";
  const totalFraudAlerts =
    (comprehensiveData?.summary?.fraudAlerts || 0) +
    (addressScanData?.scan?.fraudCases || 0);
  const escapedBankruptcies =
    comprehensiveData?.monitoring?.escapedBankruptcies?.data || [];
  const earlyWarnings = comprehensiveData?.monitoring?.earlyWarning?.data || [];
  const addressChanges = addressScanData?.data?.fraudCases || [];

  const getRiskColor = (level: string) => {
    switch (level) {
      case "CRITICAL":
        return "text-red-600 bg-red-50 border-red-200";
      case "HIGH":
        return "text-orange-600 bg-orange-50 border-orange-200";
      case "MEDIUM":
        return "text-yellow-600 bg-yellow-50 border-yellow-200";
      default:
        return "text-green-600 bg-green-50 border-green-200";
    }
  };

  return (
    <div className="space-y-6">
      {/* Fraud Risk Overview */}
      <Card className={getRiskColor(fraudRiskLevel)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 justify-between">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Svindelovervåking - Risikonivå: {fraudRiskLevel}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await Promise.all([
                  refreshComprehensive(),
                  refreshAddressScan(),
                ]);
              }}
              disabled={comprehensiveLoading || addressScanLoading}
              className="text-xs"
            >
              {comprehensiveLoading || addressScanLoading ? (
                <RefreshCw className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <RefreshCw className="h-3 w-3 mr-1" />
              )}
              Oppdater
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold">{totalFraudAlerts}</div>
              <div className="text-sm">Totale svindelvarsel</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">
                {escapedBankruptcies.length}
              </div>
              <div className="text-sm">Rømte konkurser</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{earlyWarnings.length}</div>
              <div className="text-sm">Tidlige advarsler</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Escaped Bankruptcies */}
      {escapedBankruptcies.length > 0 && (
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-800">
              <Target className="h-5 w-5" />
              🚨 Rømte Konkurser ({escapedBankruptcies.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-700 text-sm mb-4">
              Selskaper som flyttet UT av kommunen før konkurs - potensielt
              svindel!
            </p>
            <div className="space-y-3">
              {escapedBankruptcies
                .slice(0, 5)
                .map((company: any, index: number) => (
                  <div
                    key={index}
                    className="border border-red-200 rounded-lg p-3 bg-white"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-semibold text-red-900">
                          {company.companyName}
                        </h4>
                        <p className="text-sm text-red-700">
                          Flyttet fra {company.previousKommune} →{" "}
                          {company.currentKommune}
                        </p>
                        <p className="text-xs text-red-600">
                          Org.nr: {company.organizationNumber} •{" "}
                          {company.industry}
                        </p>
                      </div>
                      <Badge className="bg-red-600 text-white">KRITISK</Badge>
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Early Warning System */}
      {earlyWarnings.length > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-800">
              <Eye className="h-5 w-5" />
              ⚠️ Tidlige Advarsler ({earlyWarnings.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-amber-700 text-sm mb-4">
              Selskaper som nylig flyttet ut - potensielle fremtidige konkurser
            </p>
            <div className="space-y-3">
              {earlyWarnings.slice(0, 3).map((company: any, index: number) => (
                <div
                  key={index}
                  className="border border-amber-200 rounded-lg p-3 bg-white"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-semibold text-amber-900">
                        {company.companyName}
                      </h4>
                      <p className="text-sm text-amber-700">
                        {company.industry} • Risiko: {company.riskLevel}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className="border-amber-600 text-amber-700"
                    >
                      OVERVÅK
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Address Change Fraud Cases */}
      {addressChanges.length > 0 && (
        <Card className="border-purple-200 bg-purple-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-purple-800">
              <TrendingUp className="h-5 w-5" />
              🔍 Adresseendring-Svindel ({addressChanges.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-purple-700 text-sm mb-4">
              Selskaper som endret adresse før konkurs - bekreftet
              svindelmønster
            </p>
            <div className="space-y-3">
              {addressChanges.slice(0, 3).map((company: any, index: number) => (
                <div
                  key={index}
                  className="border border-purple-200 rounded-lg p-3 bg-white"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-semibold text-purple-900">
                        {company.companyName}
                      </h4>
                      <p className="text-sm text-purple-700">
                        {company.oldAddress.kommuneName} →{" "}
                        {company.newAddress.kommuneName}
                      </p>
                      <p className="text-xs text-purple-600">
                        Konkurs: {company.bankruptcyDate} •{" "}
                        {company.suspiciousPatterns.join(", ")}
                      </p>
                    </div>
                    <Badge className="bg-purple-600 text-white">SVINDEL</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* No Fraud Cases */}
      {totalFraudAlerts === 0 && (
        <Card className="border-green-200 bg-green-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-800">
              <Shield className="h-5 w-5" />✅ Ingen Svindelvarsel
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-green-700">
              Ingen mistenkelige adresseendringer eller svindelmønstre oppdaget
              for denne kommunen. Systemet overvåker kontinuerlig for
              potensielle trusler.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
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

  const [gapAnalysis, setGapAnalysis] = useState<any>(null);
  const [showGapDetails, setShowGapDetails] = useState(false);

  const handleIntelligentUpdate = async () => {
    setIsUpdating(true);
    try {
      // First, analyze gaps
      const gapResponse = await fetch(`/api/intelligent-update/${id}`);
      const gapData = await gapResponse.json();
      setGapAnalysis(gapData);
      setShowGapDetails(true);
    } catch (error) {
      console.error("Gap analysis failed:", error);
    } finally {
      setIsUpdating(false);
    }
  };

  const executeDataFill = async () => {
    setIsUpdating(true);
    try {
      const response = await fetch(`/api/intelligent-update/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ executeNow: true }),
      });
      const result = await response.json();

      if (result.success) {
        // Refresh the page data
        await triggerUpdate();
        setShowGapDetails(false);
        setGapAnalysis(null);
      }
    } catch (error) {
      console.error("Data fill failed:", error);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleUpdateData = async () => {
    await handleIntelligentUpdate();
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

      {/* Intelligent Gap Analysis */}
      {showGapDetails && gapAnalysis && (
        <Card
          className={`border-2 ${
            gapAnalysis.dataStatus.priorityLevel === "CRITICAL"
              ? "border-red-300 bg-red-50"
              : gapAnalysis.dataStatus.priorityLevel === "HIGH"
                ? "border-orange-300 bg-orange-50"
                : gapAnalysis.dataStatus.priorityLevel === "MEDIUM"
                  ? "border-yellow-300 bg-yellow-50"
                  : "border-green-300 bg-green-50"
          }`}
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              🧠 Intelligent Dataanalyse -{" "}
              {gapAnalysis.dataStatus.priorityLevel} Prioritet
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="text-center p-3 border rounded-lg bg-white">
                <div className="text-2xl font-bold text-blue-600">
                  {gapAnalysis.dataStatus.completionPercentage.toFixed(1)}%
                </div>
                <div className="text-sm">Datakompletthet</div>
              </div>
              <div className="text-center p-3 border rounded-lg bg-white">
                <div className="text-2xl font-bold text-red-600">
                  {gapAnalysis.dataStatus.daysMissing}
                </div>
                <div className="text-sm">Dager mangler</div>
              </div>
              <div className="text-center p-3 border rounded-lg bg-white">
                <div className="text-2xl font-bold text-green-600">
                  {gapAnalysis.fillingPlan.estimatedDuration}
                </div>
                <div className="text-sm">Minutter å fylle</div>
              </div>
            </div>

            <div className="mb-4">
              <h4 className="font-medium mb-2">
                📊 Fyllstrategi:{" "}
                {gapAnalysis.fillingPlan.strategy.replace(/_/g, " ")}
              </h4>
              <p className="text-sm text-gray-600 mb-3">
                {gapAnalysis.fillingPlan.totalPhases} faser planlagt,{" "}
                {gapAnalysis.fillingPlan.apiCallsRequired} API-kall nødvendig
              </p>

              <div className="space-y-2">
                <h5 className="font-medium text-sm">🎯 Anbefalinger:</h5>
                <ul className="space-y-1">
                  {gapAnalysis.recommendations
                    .slice(0, 4)
                    .map((rec: string, index: number) => (
                      <li
                        key={index}
                        className="text-sm flex items-start gap-2"
                      >
                        <span className="text-xs">•</span>
                        <span>{rec}</span>
                      </li>
                    ))}
                </ul>
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                onClick={executeDataFill}
                disabled={isUpdating}
                className="bg-green-600 hover:bg-green-700"
              >
                {isUpdating ? (
                  <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Database className="h-4 w-4 mr-2" />
                )}
                {isUpdating
                  ? "Fyller data..."
                  : `Fyll ${gapAnalysis.dataStatus.daysMissing} dager`}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowGapDetails(false)}
              >
                Avbryt
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Traditional Data Coverage Info (fallback) */}
      {!showGapDetails && dataGaps && (
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

      {/* Comprehensive Fraud Detection System */}
      <FraudMonitoringSection kommuneNumber={id} />

      {/* Traditional Address Changes (kept for compatibility) */}
      <AddressChangesSection addressChanges={[]} />
    </div>
  );
}
