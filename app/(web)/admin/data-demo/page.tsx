"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertCircle,
  CheckCircle,
  Database,
  Calendar,
  TrendingUp,
  AlertTriangle,
} from "lucide-react";

export default function DataDemoPage() {
  const [dataGaps, setDataGaps] = useState<any>(null);
  const [selectedKommune, setSelectedKommune] = useState("0301");

  const kommuner = [
    { id: "0301", name: "Oslo", expectedData: "High volume" },
    { id: "4201", name: "Risør", expectedData: "Medium volume" },
    { id: "4203", name: "Arendal", expectedData: "Medium volume" },
  ];

  const fetchDataGaps = async (kommuneId: string) => {
    try {
      const response = await fetch(`/api/data-gaps/${kommuneId}`);
      const result = await response.json();
      if (result.success) {
        setDataGaps(result);
      }
    } catch (error) {
      console.error("Failed to fetch data gaps:", error);
    }
  };

  useEffect(() => {
    fetchDataGaps(selectedKommune);
  }, [selectedKommune]);

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Data Coverage Demo</h1>
          <p className="text-gray-600 mt-1">
            Demonstrasjon av hvordan systemet identifiserer og håndterer
            manglende data
          </p>
        </div>
      </div>

      {/* Kommune Selector */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Velg kommune for analyse
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            {kommuner.map((kommune) => (
              <Button
                key={kommune.id}
                onClick={() => setSelectedKommune(kommune.id)}
                variant={selectedKommune === kommune.id ? "default" : "outline"}
                className="flex flex-col items-center p-4 h-auto"
              >
                <span className="font-medium">{kommune.name}</span>
                <span className="text-xs text-gray-500">
                  {kommune.expectedData}
                </span>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Current Data Coverage */}
      {dataGaps && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Coverage Overview */}
          <Card
            className={
              dataGaps.statistics.coveragePercentage > 80
                ? "border-green-200 bg-green-50"
                : "border-yellow-200 bg-yellow-50"
            }
          >
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                {dataGaps.statistics.coveragePercentage > 80 ? (
                  <CheckCircle className="h-8 w-8 text-green-600" />
                ) : (
                  <AlertCircle className="h-8 w-8 text-yellow-600" />
                )}
                <div>
                  <h3 className="font-semibold text-lg">
                    {dataGaps.statistics.coveragePercentage.toFixed(1)}%
                  </h3>
                  <p className="text-sm text-gray-600">Datadekning siste år</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Data Gaps */}
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-8 w-8 text-red-600" />
                <div>
                  <h3 className="font-semibold text-lg">
                    {dataGaps.statistics.totalGaps}
                  </h3>
                  <p className="text-sm text-gray-600">Hull i dataene</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Missing Days */}
          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Calendar className="h-8 w-8 text-blue-600" />
                <div>
                  <h3 className="font-semibold text-lg">
                    {dataGaps.statistics.totalMissingDays}
                  </h3>
                  <p className="text-sm text-gray-600">Dager mangler</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Explanation */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Hvordan systemet fungerer
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 text-sm">
            <div>
              <h4 className="font-semibold mb-2">
                🎯 Intelligent datahåndtering:
              </h4>
              <p>
                Systemet beregner automatisk hvilke datoperioder som mangler
                data for hver kommune og henter kun det som trengs.
              </p>
            </div>

            <div>
              <h4 className="font-semibold mb-2">
                📊 I produksjon vil systemet:
              </h4>
              <ul className="list-disc list-inside space-y-1 ml-4">
                <li>Koble til norske konkursregistre via API</li>
                <li>Automatisk oppdatere data hver dag kl. 02:00</li>
                <li>Kun hente manglende data (ikke duplikater)</li>
                <li>
                  Spore adresseendringer og varsle om mistenkelige mønstre
                </li>
                <li>Gi sanntidsdata via SWR-caching</li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-2">⚡ Ytelse og pålitelighet:</h4>
              <ul className="list-disc list-inside space-y-1 ml-4">
                <li>5-minutters cache med bakgrunnsoppdatering</li>
                <li>Automatisk retry ved API-feil</li>
                <li>Graceful degradation ved nedetid</li>
                <li>Overvåking og varsling ved problemer</li>
              </ul>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
              <h4 className="font-semibold text-blue-900 mb-2">
                💡 Demo-data forklaring:
              </h4>
              <p className="text-blue-800">
                Akkurat nå viser systemet mock-data siden Sanity CMS ikke er
                konfigurert. Oslo viser 24 konkurser med realistisk
                dataspredning, mens mindre kommuner som Risør viser færre
                konkurser. Datahullene du ser er simulerte for å demonstrere
                gap-deteksjonsfunksjonaliteten.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Data Gaps Details */}
      {dataGaps && dataGaps.gaps.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Detaljert gap-analyse</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {dataGaps.gaps.slice(0, 5).map((gap: any, index: number) => (
                <div
                  key={index}
                  className="flex justify-between items-center p-3 bg-gray-50 rounded-lg"
                >
                  <div>
                    <span className="font-medium">Gap {index + 1}:</span>
                    <span className="ml-2 text-sm text-gray-600">
                      {gap.startDate} til {gap.endDate}
                    </span>
                  </div>
                  <Badge variant="secondary">{gap.missingDays} dager</Badge>
                </div>
              ))}
              {dataGaps.gaps.length > 5 && (
                <p className="text-sm text-gray-500 text-center pt-2">
                  ... og {dataGaps.gaps.length - 5} flere hull
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

