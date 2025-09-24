"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  RefreshCw,
  Users,
  AlertTriangle,
  Building,
  MapPin,
  Calendar,
  TrendingUp,
} from "lucide-react";

export default function GlobalDetectivePage() {
  const [orgNumber, setOrgNumber] = useState("");
  const [investigationData, setInvestigationData] = useState<any>(null);
  const [networkData, setNetworkData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [networkLoading, setNetworkLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"company" | "network">("company");

  const handleInvestigate = async () => {
    if (!orgNumber.trim()) {
      setError("Vennligst skriv inn et organisasjonsnummer");
      return;
    }

    setLoading(true);
    setError("");
    setInvestigationData(null);
    setNetworkData(null);

    try {
      const response = await fetch(
        `/api/investigate-company/${orgNumber.replace(/\s/g, "")}`
      );
      if (!response.ok) {
        throw new Error("Investigation failed");
      }

      const data = await response.json();
      setInvestigationData(data);
    } catch (err) {
      setError("Kunne ikke undersøke selskap. Prøv igjen.");
      console.error("Investigation error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleNetworkAnalysis = async () => {
    if (!investigationData?.investigation?.connections?.length) {
      setError("Ingen nøkkelpersoner funnet for nettverksanalyse");
      return;
    }

    setNetworkLoading(true);
    setError("");

    try {
      // Get the first key person for network analysis
      const keyPerson = investigationData.investigation.connections.find(
        (c: any) => c.type === "KEY_PERSON"
      )?.name;

      if (!keyPerson) {
        throw new Error("Ingen nøkkelperson funnet");
      }

      const response = await fetch(
        `/api/person-network/${encodeURIComponent(keyPerson)}`
      );
      if (!response.ok) {
        throw new Error("Network analysis failed");
      }

      const data = await response.json();
      setNetworkData(data);
      setActiveTab("network");
    } catch (err) {
      setError("Kunne ikke analysere nettverk. Prøv igjen.");
      console.error("Network analysis error:", err);
    } finally {
      setNetworkLoading(false);
    }
  };

  const getRiskColor = (level: string) => {
    switch (level) {
      case "CRITICAL":
        return "border-red-300 bg-red-50 text-red-800";
      case "HIGH":
        return "border-orange-300 bg-orange-50 text-orange-800";
      case "MEDIUM":
        return "border-yellow-300 bg-yellow-50 text-yellow-800";
      default:
        return "border-green-300 bg-green-50 text-green-800";
    }
  };

  return (
    <div className="container mx-auto py-8 space-y-8">
      {/* Breadcrumb */}
      <div className="text-sm text-gray-600">
        <Link href="/kommuner" className="hover:text-gray-900">
          Kommuner
        </Link>
        <span className="mx-2">→</span>
        <span className="font-medium">🕵️‍♂️ Global Detektiv-Undersøkelse</span>
      </div>

      {/* Header */}
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold text-gray-900">
          🔍 Global Selskapsanalyse
        </h1>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          Dypere undersøkelse av selskap og nettverk ved organisasjonsnummer.
          Søker i hele Norge for å avdekke forbindelser og risikofaktorer.
        </p>
      </div>

      {/* Search Section */}
      <Card className="border-purple-200 bg-purple-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-purple-800">
            <Search className="h-5 w-5" />
            Undersøk Selskap
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              type="text"
              placeholder="Organisasjonsnummer (f.eks. 123456789)"
              value={orgNumber}
              onChange={(e) => setOrgNumber(e.target.value)}
              className="flex-1 text-lg"
            />
            <Button
              onClick={handleInvestigate}
              disabled={loading}
              size="lg"
              className="bg-purple-600 hover:bg-purple-700"
            >
              {loading ? (
                <RefreshCw className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Search className="h-4 w-4 mr-2" />
              )}
              Undersøk
            </Button>
          </div>

          {investigationData && (
            <div className="flex gap-2">
              <Button
                onClick={handleNetworkAnalysis}
                disabled={networkLoading}
                variant="outline"
                className="border-purple-300 text-purple-700 hover:bg-purple-100"
              >
                {networkLoading ? (
                  <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Users className="h-4 w-4 mr-2" />
                )}
                Analyser Nettverk
              </Button>
            </div>
          )}

          {error && (
            <div className="text-red-600 text-sm bg-red-50 p-3 rounded border border-red-200">
              <AlertTriangle className="h-4 w-4 inline mr-2" />
              {error}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results Section */}
      {(investigationData || networkData) && (
        <div className="space-y-6">
          {/* Tab Navigation */}
          <div className="flex gap-2 justify-center">
            <Button
              variant={activeTab === "company" ? "default" : "outline"}
              onClick={() => setActiveTab("company")}
              className={activeTab === "company" ? "bg-purple-600" : ""}
            >
              <Building className="h-4 w-4 mr-2" />
              Selskap
            </Button>
            {networkData && (
              <Button
                variant={activeTab === "network" ? "default" : "outline"}
                onClick={() => setActiveTab("network")}
                className={activeTab === "network" ? "bg-purple-600" : ""}
              >
                <Users className="h-4 w-4 mr-2" />
                Nettverk ({networkData.companies?.length || 0})
              </Button>
            )}
          </div>

          {/* Company Investigation Tab */}
          {activeTab === "company" && investigationData && (
            <div className="space-y-6">
              {/* Company Overview */}
              <Card
                className={`border-2 ${getRiskColor(investigationData.investigation.fraudRiskLevel)}`}
              >
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-2xl mb-2">
                        {investigationData.company.name}
                      </CardTitle>
                      <div className="flex items-center gap-4 text-sm">
                        <span>
                          <strong>Org.nr:</strong>{" "}
                          {investigationData.company.organizationNumber}
                        </span>
                        <span>
                          <strong>Status:</strong>{" "}
                          {investigationData.company.status}
                        </span>
                      </div>
                    </div>
                    <Badge
                      variant={
                        investigationData.investigation.fraudRiskLevel ===
                        "CRITICAL"
                          ? "destructive"
                          : investigationData.investigation.fraudRiskLevel ===
                              "HIGH"
                            ? "secondary"
                            : "default"
                      }
                      className="text-lg px-4 py-2"
                    >
                      {investigationData.investigation.fraudRiskLevel}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-3">
                      <h4 className="font-semibold flex items-center gap-2">
                        <Building className="h-4 w-4" />
                        Selskapsinfo
                      </h4>
                      <div className="text-sm space-y-1">
                        <p>
                          <strong>Bransje:</strong>{" "}
                          {investigationData.company.industry}
                        </p>
                        <p>
                          <strong>Organisasjonsform:</strong>{" "}
                          {investigationData.company.organizationForm}
                        </p>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <h4 className="font-semibold flex items-center gap-2">
                        <MapPin className="h-4 w-4" />
                        Adresser
                      </h4>
                      <div className="text-sm space-y-1">
                        <p>
                          <strong>Forretning:</strong>{" "}
                          {investigationData.addresses.business}
                        </p>
                        {investigationData.addresses.postal && (
                          <p>
                            <strong>Post:</strong>{" "}
                            {investigationData.addresses.postal}
                          </p>
                        )}
                        <p>
                          <strong>Kommune:</strong>{" "}
                          {investigationData.addresses.businessKommune}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Suspicious Patterns */}
              {investigationData.investigation.suspiciousPatterns?.length >
                0 && (
                <Card className="border-yellow-300 bg-yellow-50">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-yellow-800">
                      <AlertTriangle className="h-5 w-5" />
                      Mistenkelige Mønstre
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {investigationData.investigation.suspiciousPatterns.map(
                        (pattern: string, index: number) => (
                          <Badge
                            key={index}
                            variant="outline"
                            className="border-yellow-400 text-yellow-800"
                          >
                            {pattern.replace(/_/g, " ")}
                          </Badge>
                        )
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Professional Connections */}
              {investigationData.investigation.connections?.length > 0 && (
                <Card className="border-blue-300 bg-blue-50">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-blue-800">
                      <Users className="h-5 w-5" />
                      Profesjonelle Forbindelser
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {investigationData.investigation.connections.map(
                        (conn: any, index: number) => (
                          <div
                            key={index}
                            className="bg-white p-4 rounded-lg border"
                          >
                            <div className="flex justify-between items-start mb-2">
                              <h5 className="font-semibold">{conn.name}</h5>
                              <Badge variant="outline">{conn.type}</Badge>
                            </div>
                            {conn.orgNumber && (
                              <p className="text-sm text-gray-600 mb-1">
                                Org.nr: {conn.orgNumber}
                              </p>
                            )}
                            {conn.address && (
                              <p className="text-sm text-gray-600 mb-1">
                                {conn.address}
                              </p>
                            )}
                            <p className="text-sm">
                              {conn.role || conn.significance}
                            </p>
                            {conn.riskLevel && (
                              <Badge
                                variant={
                                  conn.riskLevel === "CRITICAL"
                                    ? "destructive"
                                    : "secondary"
                                }
                                className="mt-2"
                              >
                                {conn.riskLevel}
                              </Badge>
                            )}
                          </div>
                        )
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Network Analysis Tab */}
          {activeTab === "network" && networkData && (
            <div className="space-y-6">
              {/* Network Overview */}
              <Card className="border-indigo-300 bg-indigo-50">
                <CardHeader>
                  <CardTitle className="text-2xl text-indigo-800">
                    Nettverksanalyse: {networkData.person}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-indigo-600">
                        {networkData.companies?.length || 0}
                      </div>
                      <div className="text-sm text-indigo-800">Selskap</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-indigo-600">
                        {Math.round(networkData.riskScore || 0)}
                      </div>
                      <div className="text-sm text-indigo-800">
                        Nettverksrisiko
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-indigo-600">
                        {networkData.summary?.criticalRiskCompanies || 0}
                      </div>
                      <div className="text-sm text-indigo-800">
                        Kritisk risiko
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-indigo-600">
                        {networkData.suspiciousPatterns?.length || 0}
                      </div>
                      <div className="text-sm text-indigo-800">Varsel</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Network Alerts */}
              {networkData.suspiciousPatterns?.length > 0 && (
                <Card className="border-red-300 bg-red-50">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-red-800">
                      <AlertTriangle className="h-5 w-5" />
                      Nettverksvarsel
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {networkData.suspiciousPatterns.map(
                        (pattern: string, index: number) => (
                          <li
                            key={index}
                            className="flex items-start gap-2 text-red-700"
                          >
                            <span className="text-red-500 mt-1">•</span>
                            {pattern}
                          </li>
                        )
                      )}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {/* Connected Companies */}
              {networkData.companies?.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Building className="h-5 w-5" />
                      Tilknyttede Selskap ({networkData.companies.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {networkData.companies
                        .slice(0, 12)
                        .map((company: any, index: number) => (
                          <div
                            key={index}
                            className="bg-gray-50 p-4 rounded-lg border hover:shadow-md transition-shadow"
                          >
                            <div className="flex justify-between items-start mb-2">
                              <h5 className="font-semibold text-sm leading-tight">
                                {company.name}
                              </h5>
                              <Badge
                                variant={
                                  company.riskScore >= 80
                                    ? "destructive"
                                    : company.riskScore >= 60
                                      ? "secondary"
                                      : "outline"
                                }
                                className="ml-2"
                              >
                                {company.riskScore}
                              </Badge>
                            </div>
                            <div className="text-xs text-gray-600 space-y-1">
                              <p>{company.organizationNumber}</p>
                              <p>{company.industry?.description}</p>
                              {company.tags?.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {company.tags
                                    .slice(0, 2)
                                    .map((tag: string, tagIndex: number) => (
                                      <Badge
                                        key={tagIndex}
                                        variant="outline"
                                        className="text-xs"
                                      >
                                        {tag}
                                      </Badge>
                                    ))}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                    </div>
                    {networkData.companies.length > 12 && (
                      <div className="text-center mt-4 text-gray-600">
                        ... og {networkData.companies.length - 12} flere selskap
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
