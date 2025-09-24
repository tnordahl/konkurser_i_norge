"use client";

import React, { useState } from "react";
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
  MapPin,
  Calendar,
  TrendingUp,
  RefreshCw,
  Shield,
  Eye,
  Target,
  ArrowRight,
  Clock,
  Building2,
  AlertCircle,
  CheckCircle,
  XCircle,
} from "lucide-react";
import useSWR from "swr";

interface MovementPattern {
  id: string;
  organizationNumber: string;
  companyName: string;
  movementType: "inbound" | "outbound" | "cross-regional" | "suspicious";
  riskLevel: "low" | "medium" | "high" | "critical";
  timeline: {
    fromDate: string;
    toDate: string;
    daysBetween: number;
  };
  addresses: {
    from: {
      address: string;
      city: string;
      postalCode: string;
      kommuneNumber: string;
      kommuneName: string;
    };
    to: {
      address: string;
      city: string;
      postalCode: string;
      kommuneNumber: string;
      kommuneName: string;
    };
  };
  fraudIndicators: string[];
  verificationStatus: "verified" | "pending" | "suspicious" | "cleared";
  metadata: {
    detectionMethod: string;
    confidence: number;
    lastVerified: string;
  };
}

interface MovementAnalysis {
  summary: {
    totalMovements: number;
    inboundMovements: number;
    outboundMovements: number;
    suspiciousMovements: number;
    riskDistribution: Record<string, number>;
  };
  patterns: MovementPattern[];
  insights: string[];
  recommendations: string[];
}

interface AddressMovementDetectionProps {
  kommuneNumber: string;
  kommuneName: string;
}

// Reusable Movement Table Component
function MovementTable({
  patterns,
  onSelectPattern,
}: {
  patterns: MovementPattern[];
  onSelectPattern: (pattern: MovementPattern) => void;
}) {
  const getRiskBadgeColor = (riskLevel: string) => {
    switch (riskLevel) {
      case "critical":
        return "bg-red-600 text-white";
      case "high":
        return "bg-red-500 text-white";
      case "medium":
        return "bg-yellow-500 text-white";
      case "low":
        return "bg-green-500 text-white";
      default:
        return "bg-gray-500 text-white";
    }
  };

  const getVerificationIcon = (status: string) => {
    switch (status) {
      case "verified":
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case "cleared":
        return <CheckCircle className="h-4 w-4 text-blue-600" />;
      case "suspicious":
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      case "pending":
        return <Clock className="h-4 w-4 text-yellow-600" />;
      default:
        return <XCircle className="h-4 w-4 text-gray-600" />;
    }
  };

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Company</TableHead>
            <TableHead>Movement</TableHead>
            <TableHead>Timeline</TableHead>
            <TableHead>Risk</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Confidence</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {patterns.slice(0, 20).map((pattern) => (
            <TableRow key={pattern.id}>
              <TableCell>
                <div>
                  <div className="font-medium">{pattern.companyName}</div>
                  <div className="text-sm text-gray-500">
                    {pattern.organizationNumber}
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <div className="text-sm">
                  <div className="font-medium">
                    {pattern.addresses.from.city}
                  </div>
                  <ArrowRight className="h-3 w-3 inline mx-1" />
                  <div className="font-medium">{pattern.addresses.to.city}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {pattern.addresses.from.postalCode} →{" "}
                    {pattern.addresses.to.postalCode}
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <div className="text-sm">
                  <div>{pattern.timeline.daysBetween} days</div>
                  <div className="text-gray-500">
                    {new Date(pattern.timeline.fromDate).toLocaleDateString()}
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <Badge className={getRiskBadgeColor(pattern.riskLevel)}>
                  {pattern.riskLevel.toUpperCase()}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  {getVerificationIcon(pattern.verificationStatus)}
                  <span className="text-sm capitalize">
                    {pattern.verificationStatus}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                <div className="text-sm">{pattern.metadata.confidence}%</div>
              </TableCell>
              <TableCell>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onSelectPattern(pattern)}
                >
                  <Eye className="h-3 w-3 mr-1" />
                  Details
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default function AddressMovementDetection({
  kommuneNumber,
  kommuneName,
}: AddressMovementDetectionProps) {
  const [timeframe, setTimeframe] = useState("365");
  const [riskFilter, setRiskFilter] = useState("all");
  const [selectedPattern, setSelectedPattern] =
    useState<MovementPattern | null>(null);

  const fetcher = async (url: string) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Failed to fetch movement data");
    return response.json();
  };

  const {
    data,
    error,
    isLoading,
    mutate: refresh,
  } = useSWR(
    `/api/advanced-movement-detection/${kommuneNumber}?timeframe=${timeframe}&riskLevel=${riskFilter}`,
    fetcher,
    {
      refreshInterval: 0,
      dedupingInterval: 60000, // Cache for 1 minute
      revalidateOnFocus: false,
    }
  );

  const analysis: MovementAnalysis | null = data?.analysis || null;

  const getRiskBadgeColor = (riskLevel: string) => {
    switch (riskLevel) {
      case "critical":
        return "bg-red-600 text-white";
      case "high":
        return "bg-red-500 text-white";
      case "medium":
        return "bg-yellow-500 text-white";
      case "low":
        return "bg-green-500 text-white";
      default:
        return "bg-gray-500 text-white";
    }
  };

  if (error) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <div>
              <h3 className="font-semibold text-red-900">
                Movement Detection Error
              </h3>
              <p className="text-red-800 text-sm">
                Failed to load address movement data. Please try again.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Control Panel */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Advanced Address Movement Detection - {kommuneName}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 items-center">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              <label className="text-sm font-medium">Timeframe (days):</label>
              <Input
                type="number"
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value)}
                className="w-20"
                min="1"
                max="365"
              />
            </div>

            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              <label className="text-sm font-medium">Risk Level:</label>
              <select
                value={riskFilter}
                onChange={(e) => setRiskFilter(e.target.value)}
                className="px-3 py-1 border rounded-md text-sm"
              >
                <option value="all">All Levels</option>
                <option value="critical">Critical Only</option>
                <option value="high">High Risk</option>
                <option value="medium">Medium Risk</option>
                <option value="low">Low Risk</option>
              </select>
            </div>

            <Button
              onClick={() => refresh()}
              disabled={isLoading}
              variant="outline"
              size="sm"
            >
              <RefreshCw
                className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Summary Dashboard */}
      {analysis && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">
                    Total Movements
                  </p>
                  <p className="text-2xl font-bold">
                    {analysis.summary.totalMovements}
                  </p>
                </div>
                <TrendingUp className="h-8 w-8 text-blue-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Inbound</p>
                  <p className="text-2xl font-bold text-green-600">
                    📥 {analysis.summary.inboundMovements}
                  </p>
                </div>
                <MapPin className="h-8 w-8 text-green-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Outbound</p>
                  <p className="text-2xl font-bold text-orange-600">
                    📤 {analysis.summary.outboundMovements}
                  </p>
                </div>
                <MapPin className="h-8 w-8 text-orange-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">
                    Suspicious
                  </p>
                  <p className="text-2xl font-bold text-red-600">
                    🚨 {analysis.summary.suspiciousMovements}
                  </p>
                </div>
                <AlertTriangle className="h-8 w-8 text-red-600" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Risk Distribution */}
      {analysis && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Risk Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              {Object.entries(analysis.summary.riskDistribution).map(
                ([level, count]) => (
                  <div key={level} className="flex items-center gap-2">
                    <Badge className={getRiskBadgeColor(level)}>
                      {level.toUpperCase()}
                    </Badge>
                    <span className="font-semibold">{count}</span>
                  </div>
                )
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Movement Patterns - Separated by Type */}
      {analysis && analysis.patterns.length > 0 && (
        <div className="space-y-6">
          {/* Out of Kommune */}
          {analysis.patterns.filter((p) => p.movementType === "outbound")
            .length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span>📤</span>
                  Companies Moving OUT of {kommuneName}
                </CardTitle>
              </CardHeader>
              <CardContent className="max-h-96 overflow-y-auto">
                <MovementTable
                  patterns={analysis.patterns.filter(
                    (p) => p.movementType === "outbound"
                  )}
                  onSelectPattern={setSelectedPattern}
                />
              </CardContent>
            </Card>
          )}

          {/* Into Kommune */}
          {analysis.patterns.filter(
            (p) =>
              p.movementType === "inbound" &&
              p.addresses.from.kommuneNumber !== p.addresses.to.kommuneNumber
          ).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span>📥</span>
                  Companies Moving INTO {kommuneName}
                </CardTitle>
              </CardHeader>
              <CardContent className="max-h-96 overflow-y-auto">
                <MovementTable
                  patterns={analysis.patterns.filter(
                    (p) =>
                      p.movementType === "inbound" &&
                      p.addresses.from.kommuneNumber !==
                        p.addresses.to.kommuneNumber
                  )}
                  onSelectPattern={setSelectedPattern}
                />
              </CardContent>
            </Card>
          )}

          {/* Within Kommune */}
          {analysis.patterns.filter(
            (p) =>
              p.addresses.from.kommuneNumber === p.addresses.to.kommuneNumber
          ).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span>🔄</span>
                  Address Changes WITHIN {kommuneName}
                </CardTitle>
              </CardHeader>
              <CardContent className="max-h-96 overflow-y-auto">
                <MovementTable
                  patterns={analysis.patterns.filter(
                    (p) =>
                      p.addresses.from.kommuneNumber ===
                      p.addresses.to.kommuneNumber
                  )}
                  onSelectPattern={setSelectedPattern}
                />
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Insights and Recommendations */}
      {analysis && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Key Insights
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {analysis.insights.map((insight, index) => (
                  <li key={index} className="text-sm flex items-start gap-2">
                    <span className="text-blue-600 mt-0.5">•</span>
                    <span>{insight}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                Recommendations
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {analysis.recommendations.map((recommendation, index) => (
                  <li key={index} className="text-sm flex items-start gap-2">
                    <span className="text-green-600 mt-0.5">•</span>
                    <span>{recommendation}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin mr-2" />
              <span>Analyzing address movements...</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* No Data State */}
      {analysis && analysis.patterns.length === 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <MapPin className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No Movement Patterns Detected
              </h3>
              <p className="text-gray-600">
                No address movements found for {kommuneName} in the selected
                timeframe. Try adjusting the timeframe or risk level filters.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pattern Detail Modal would go here */}
      {selectedPattern && (
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Movement Pattern Details</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedPattern(null)}
              >
                ✕
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <h4 className="font-semibold">Company Information</h4>
                <p>
                  {selectedPattern.companyName} (
                  {selectedPattern.organizationNumber})
                </p>
              </div>

              <div>
                <h4 className="font-semibold">Movement Details</h4>
                <div className="grid grid-cols-2 gap-4 mt-2">
                  <div>
                    <p className="text-sm font-medium">From:</p>
                    <p className="text-sm">
                      {selectedPattern.addresses.from.address}
                    </p>
                    <p className="text-sm text-gray-600">
                      {selectedPattern.addresses.from.city},{" "}
                      {selectedPattern.addresses.from.postalCode}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium">To:</p>
                    <p className="text-sm">
                      {selectedPattern.addresses.to.address}
                    </p>
                    <p className="text-sm text-gray-600">
                      {selectedPattern.addresses.to.city},{" "}
                      {selectedPattern.addresses.to.postalCode}
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-semibold">Fraud Indicators</h4>
                <ul className="list-disc list-inside text-sm mt-2">
                  {selectedPattern.fraudIndicators.map((indicator, index) => (
                    <li key={index}>{indicator}</li>
                  ))}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
