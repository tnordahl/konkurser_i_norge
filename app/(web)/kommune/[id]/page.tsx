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
  History,
  AlertCircle,
} from "lucide-react";
import AddressMovementDetection from "@/components/AddressMovementDetection";
import SimplifiedFraudDetection from "@/components/SimplifiedFraudDetection";
import SimpleDataCoverage from "@/components/SimpleDataCoverage";
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
              konkursregistre via API. Klikk &quot;Oppdater data&quot; for å hente data.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {bankruptcies.map((bankruptcy) => (
              <div key={bankruptcy.id}>
                <AlertCard bankruptcy={bankruptcy} />
                <div className="border rounded-lg p-4 mt-2">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h4 className="font-semibold">
                        {bankruptcy.companyName}
                      </h4>
                      {bankruptcy.konkursbo && (
                        <p className="text-sm text-gray-500 mt-1">
                          Konkursbo: {bankruptcy.konkursbo.name} (
                          {bankruptcy.konkursbo.organizationNumber})
                        </p>
                      )}
                    </div>
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
                  {bankruptcy.originalCompany && (
                    <div className="mt-3 p-2 bg-blue-50 rounded text-sm">
                      <strong>Opprinnelig selskap:</strong>{" "}
                      {bankruptcy.originalCompany.name} (
                      {bankruptcy.originalCompany.organizationNumber})
                      {bankruptcy.originalCompany.registrationDate && (
                        <span className="ml-2 text-gray-600">
                          Registrert:{" "}
                          {new Date(
                            bankruptcy.originalCompany.registrationDate
                          ).toLocaleDateString("nb-NO")}
                        </span>
                      )}
                    </div>
                  )}
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
    refreshInterval: 0, // Disabled to prevent multiple scans
    dedupingInterval: 300000, // Cache for 5 minutes
    revalidateOnFocus: false, // Don't refresh when user returns to tab
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
    refreshInterval: 0, // Disabled to prevent multiple scans
    dedupingInterval: 300000, // Cache for 5 minutes
    revalidateOnFocus: false, // Don't refresh when user returns to tab
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
            Selskapsanalyse
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-gray-500">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Analyserer adresseendringer og selskapsmønstre...
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
            Selskapsanalyse
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-500">Kunne ikke laste selskapsdata</p>
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
              Selskapsanalyse - Risikonivå: {fraudRiskLevel}
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
              <div className="text-sm">Totale risikovarsel</div>
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
              mistenkelig mønster!
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
              🔍 Adresseendringer ({addressChanges.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-purple-700 text-sm mb-4">
              Selskaper som endret adresse før konkurs - bekreftet mistenkelig
              mønster
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
                    <Badge className="bg-purple-600 text-white">RISIKO</Badge>
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
              <Shield className="h-5 w-5" />✅ Ingen Risikovarsel
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-green-700">
              Ingen mistenkelige adresseendringer eller mønstre oppdaget for
              denne kommunen. Systemet overvåker kontinuerlig for potensielle
              trusler.
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
            Kommune {id}: {kommune.name}
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

      {/* Advanced Address Movement Detection - Moved to top */}
      <AddressMovementDetection
        kommuneNumber={id}
        kommuneName={kommune?.name || `Kommune ${id}`}
      />

      <BankruptciesSection bankruptcies={bankruptcies} />

      {/* Simple Data Coverage */}
      <SimpleDataCoverage
        kommuneNumber={id}
        kommuneName={kommune?.name || `Kommune ${id}`}
      />

      {/* Simplified Fraud Detection */}
      <SimplifiedFraudDetection
        kommuneNumber={id}
        kommuneName={kommune?.name || `Kommune ${id}`}
      />

      {/* Abonnér på varsler - Moved to bottom */}
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
    </div>
  );
}

// Historical Company Connections Component
function HistoricalConnectionsSection({
  kommuneNumber,
}: {
  kommuneNumber: string;
}) {
  const fetcher = async (url: string) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Failed to fetch");
    return response.json();
  };

  const {
    data: connectionsData,
    error: connectionsError,
    isLoading: connectionsLoading,
    mutate: refreshConnections,
  } = useSWR(`/api/smart-cache/${kommuneNumber}`, fetcher, {
    refreshInterval: 300000, // Refresh every 5 minutes
    dedupingInterval: 60000, // Cache for 1 minute
    revalidateOnFocus: false,
    errorRetryCount: 2,
    errorRetryInterval: 5000,
  });

  const [isUpdating, setIsUpdating] = useState(false);

  const updateCompanies = async () => {
    setIsUpdating(true);
    try {
      // For now, just refresh the existing data
      // In the future, this will trigger the comprehensive company scan
      await refreshConnections();

      // Optionally trigger a bankruptcy data refresh
      const response = await fetch(`/api/intelligent-update/${kommuneNumber}`, {
        method: "POST",
      });
      if (response.ok) {
        await refreshConnections();
      }
    } catch (error) {
      console.error("Failed to update companies:", error);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <Card className="mt-6">
      <CardHeader>
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5" />
            <CardTitle>Historiske Tilknytninger</CardTitle>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={updateCompanies}
              disabled={isUpdating}
            >
              {isUpdating ? (
                <RefreshCw className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Database className="h-4 w-4 mr-2" />
              )}
              {isUpdating ? "Oppdaterer..." : "Oppdater selskaper"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refreshConnections()}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Oppdater
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {connectionsLoading ? (
          <div className="flex items-center gap-2 text-gray-500">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Analyserer historiske tilknytninger...
          </div>
        ) : connectionsError ? (
          <div className="text-red-600">
            Feil ved henting av historiske tilknytninger:{" "}
            {connectionsError.message}
          </div>
        ) : connectionsData?.data ? (
          <div className="space-y-6">
            {/* Statistics Overview */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-blue-50 p-3 rounded-lg text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {connectionsData.data.statistics.totalConnections || 0}
                </div>
                <div className="text-sm text-blue-700">
                  Historiske tilknytninger
                </div>
              </div>
              <div className="bg-green-50 p-3 rounded-lg text-center">
                <div className="text-2xl font-bold text-green-600">
                  {connectionsData.data.statistics.newFindings || 0}
                </div>
                <div className="text-sm text-green-700">Nye funn</div>
              </div>
              <div className="bg-purple-50 p-3 rounded-lg text-center">
                <div className="text-2xl font-bold text-purple-600">
                  {connectionsData.data.scanType === "initial"
                    ? "Første"
                    : "Oppdatering"}
                </div>
                <div className="text-sm text-purple-700">Scan type</div>
              </div>
              <div className="bg-gray-50 p-3 rounded-lg text-center">
                <div className="text-2xl font-bold text-gray-600">
                  {connectionsData.data.statistics.lastScanDate
                    ? new Date(
                        connectionsData.data.statistics.lastScanDate
                      ).toLocaleDateString("nb-NO")
                    : "Aldri"}
                </div>
                <div className="text-sm text-gray-700">Sist scannet</div>
              </div>
            </div>

            {/* Alert Messages */}
            {connectionsData.data.alerts &&
              connectionsData.data.alerts.length > 0 && (
                <div className="space-y-2">
                  {connectionsData.data.alerts.map(
                    (alert: string, index: number) => (
                      <div
                        key={index}
                        className={`p-3 rounded-lg flex items-start gap-2 ${
                          alert.includes("🚨 CRITICAL")
                            ? "bg-red-100 border border-red-300"
                            : alert.includes("🔴")
                              ? "bg-red-50 border border-red-200"
                              : alert.includes("📍")
                                ? "bg-yellow-50 border border-yellow-200"
                                : "bg-blue-50 border border-blue-200"
                        }`}
                      >
                        <AlertCircle
                          className={`h-4 w-4 mt-0.5 ${
                            alert.includes("🚨 CRITICAL")
                              ? "text-red-600"
                              : alert.includes("🔴")
                                ? "text-red-500"
                                : alert.includes("📍")
                                  ? "text-yellow-500"
                                  : "text-blue-500"
                          }`}
                        />
                        <span className="text-sm">{alert}</span>
                      </div>
                    )
                  )}
                </div>
              )}

            {/* Historical Connections - DETECTION RESULTS */}
            {connectionsData.data.data.historicalConnections &&
              connectionsData.data.data.historicalConnections.length > 0 && (
                <div className="bg-blue-50 border border-blue-300 rounded-lg p-4">
                  <h3 className="font-semibold text-blue-800 mb-3 flex items-center gap-2">
                    <History className="h-5 w-5" />
                    🔍 HISTORISKE SELSKAPSTILKNYTNINGER
                  </h3>
                  <div className="space-y-3">
                    {connectionsData.data.data.historicalConnections
                      .slice(0, 10)
                      .map((company: any) => (
                        <div
                          key={company.id || company.organizationNumber}
                          className="bg-white p-3 rounded border border-blue-200"
                        >
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <h4 className="font-semibold text-blue-900">
                                {company.name}
                              </h4>
                              <p className="text-sm text-blue-700">
                                Org.nr: {company.organizationNumber}
                              </p>
                            </div>
                            <div className="flex gap-1">
                              <Badge
                                variant="outline"
                                className={`${
                                  company.connection?.confidence === "HIGH"
                                    ? "border-red-300 text-red-700 bg-red-50"
                                    : company.connection?.confidence ===
                                        "MEDIUM"
                                      ? "border-yellow-300 text-yellow-700 bg-yellow-50"
                                      : "border-blue-300 text-blue-700 bg-blue-50"
                                }`}
                              >
                                {company.connection?.confidence || "UNKNOWN"}{" "}
                                Confidence
                              </Badge>
                              <Badge
                                variant="outline"
                                className="border-gray-300 text-gray-700"
                              >
                                Risk: {company.riskScore || 0}
                              </Badge>
                            </div>
                          </div>
                          <div className="text-sm text-gray-600">
                            <p>
                              Nåværende adresse:{" "}
                              {company.currentAddress || "Ukjent"}
                            </p>
                            <p>
                              Tilknytning:{" "}
                              {company.connection?.type || "Ukjent"}
                            </p>
                            <p>
                              Oppdaget:{" "}
                              {company.connection?.discoveredAt
                                ? new Date(
                                    company.connection.discoveredAt
                                  ).toLocaleDateString("nb-NO")
                                : "Ukjent dato"}
                            </p>
                          </div>
                          {company.connection?.evidence && (
                            <div className="mt-2">
                              <div className="text-xs bg-blue-100 p-2 rounded">
                                <strong>Bevis:</strong>{" "}
                                {company.connection.evidence}
                              </div>
                            </div>
                          )}
                          {company.riskAlerts &&
                            company.riskAlerts.length > 0 && (
                              <div className="mt-2 space-y-1">
                                {company.riskAlerts.map((alert: any) => (
                                  <div
                                    key={alert.id}
                                    className="text-xs bg-yellow-100 p-2 rounded"
                                  >
                                    <strong>{alert.title}:</strong>{" "}
                                    {alert.description}
                                  </div>
                                ))}
                              </div>
                            )}
                        </div>
                      ))}
                  </div>
                </div>
              )}

            {/* Summary Information */}
            {connectionsData.data.statistics.totalConnections === 0 && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  📊 Scan resultat
                </h3>
                <p className="text-sm text-gray-700">
                  {connectionsData.data.scanType === "initial"
                    ? `Første scanning av kommune ${connectionsData.data.kommuneNumber} fullført. Ingen historiske tilknytninger funnet i denne omgangen.`
                    : `Inkrementell scanning fullført. Ingen nye tilknytninger siden forrige scanning.`}
                </p>
                <p className="text-xs text-gray-500 mt-2">
                  Neste anbefalt scanning:{" "}
                  {new Date(
                    connectionsData.data.statistics.nextScanRecommended
                  ).toLocaleDateString("nb-NO")}
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="text-gray-500">
            Ingen historiske tilknytninger funnet
          </div>
        )}
      </CardContent>
    </Card>
  );
}
