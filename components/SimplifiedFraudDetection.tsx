"use client";

import React from "react";
import useSWR from "swr";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Shield,
  AlertTriangle,
  TrendingUp,
  Users,
  RefreshCw,
} from "lucide-react";

interface SimplifiedFraudDetectionProps {
  kommuneNumber: string;
  kommuneName: string;
}

export default function SimplifiedFraudDetection({
  kommuneNumber,
  kommuneName,
}: SimplifiedFraudDetectionProps) {
  const fetcher = async (url: string) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Failed to fetch");
    return response.json();
  };

  const {
    data: fraudData,
    error: fraudError,
    isLoading: fraudLoading,
  } = useSWR(`/api/comprehensive-monitoring/${kommuneNumber}`, fetcher, {
    refreshInterval: 300000, // Refresh every 5 minutes
    dedupingInterval: 60000, // Cache for 1 minute
    revalidateOnFocus: false,
    errorRetryCount: 2,
  });

  const {
    data: connectionsData,
    error: connectionsError,
    isLoading: connectionsLoading,
  } = useSWR(`/api/smart-cache/${kommuneNumber}`, fetcher, {
    refreshInterval: 300000, // Refresh every 5 minutes
    dedupingInterval: 60000, // Cache for 1 minute
    revalidateOnFocus: false,
    errorRetryCount: 2,
  });

  if (fraudLoading || connectionsLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Svindeldeteksjon
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

  if (fraudError && connectionsError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Svindeldeteksjon
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-500">Kunne ikke laste svindeldata</p>
        </CardContent>
      </Card>
    );
  }

  const fraudRiskLevel = fraudData?.summary?.fraudRiskLevel || "LOW";
  const totalFraudAlerts = fraudData?.summary?.fraudAlerts || 0;
  const escapedBankruptcies =
    fraudData?.monitoring?.escapedBankruptcies?.data || [];
  const earlyWarnings = fraudData?.monitoring?.earlyWarning?.data || [];
  const historicalConnections =
    connectionsData?.data?.historicalConnections || [];

  const getRiskColor = (level: string) => {
    switch (level) {
      case "CRITICAL":
        return "bg-red-100 text-red-800 border-red-200";
      case "HIGH":
        return "bg-orange-100 text-orange-800 border-orange-200";
      case "MEDIUM":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      default:
        return "bg-green-100 text-green-800 border-green-200";
    }
  };

  const hasAlerts =
    totalFraudAlerts > 0 ||
    escapedBankruptcies.length > 0 ||
    earlyWarnings.length > 0;

  return (
    <div className="space-y-4">
      {/* Fraud Risk Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Svindelrisiko - {kommuneName}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="text-center p-3 border rounded-lg">
              <div className="flex items-center justify-center mb-2">
                <Badge className={getRiskColor(fraudRiskLevel)}>
                  {fraudRiskLevel}
                </Badge>
              </div>
              <div className="text-sm text-gray-600">Samlet risiko</div>
            </div>

            <div className="text-center p-3 border rounded-lg">
              <div className="text-2xl font-bold text-red-600">
                {escapedBankruptcies.length}
              </div>
              <div className="text-sm text-gray-600">Rømte konkurser</div>
            </div>

            <div className="text-center p-3 border rounded-lg">
              <div className="text-2xl font-bold text-orange-600">
                {earlyWarnings.length}
              </div>
              <div className="text-sm text-gray-600">Tidlige varsler</div>
            </div>

            <div className="text-center p-3 border rounded-lg">
              <div className="text-2xl font-bold text-blue-600">
                {historicalConnections.length}
              </div>
              <div className="text-sm text-gray-600">
                Historiske tilknytninger
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Active Fraud Alerts */}
      {hasAlerts && (
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-800">
              <AlertTriangle className="h-5 w-5" />
              Aktive svindelvarsler
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {escapedBankruptcies
                .slice(0, 3)
                .map((company: any, index: number) => (
                  <div
                    key={index}
                    className="bg-white p-3 rounded border border-red-200"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">{company.companyName}</div>
                        <div className="text-sm text-gray-600">
                          {company.organizationNumber} • {company.fraudType}
                        </div>
                      </div>
                      <Badge className="bg-red-100 text-red-800">
                        {company.riskLevel}
                      </Badge>
                    </div>
                  </div>
                ))}

              {earlyWarnings.slice(0, 2).map((company: any, index: number) => (
                <div
                  key={index}
                  className="bg-white p-3 rounded border border-orange-200"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{company.companyName}</div>
                      <div className="text-sm text-gray-600">
                        {company.organizationNumber} • Nylig flyttet ut
                      </div>
                    </div>
                    <Badge className="bg-orange-100 text-orange-800">
                      Tidlig varsel
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* No Alerts */}
      {!hasAlerts && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Shield className="h-5 w-5 text-green-600" />
              <div>
                <h3 className="font-semibold text-green-900">
                  Ingen aktive varsler
                </h3>
                <p className="text-green-700 text-sm">
                  Ingen svindelmønstre eller mistenkelige aktiviteter oppdaget
                  for {kommuneName}.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
