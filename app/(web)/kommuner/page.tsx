"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Star, Bell, Database, RefreshCw, Search, Building2, MapPin, TrendingUp, AlertTriangle } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";

// Enhanced interface for new data structure
interface EnhancedKommuneData {
  id: string;
  name: string;
  county: string;
  region?: string;
  priority?: string;
  bankruptcyCount: number;
  companyCount: number;
  postalCodeCount: number;
  addressChangeCount: number;
  sampleCompanies: Array<{
    name: string;
    organizationNumber: string;
    status: string;
    industry?: string;
  }>;
  postalCodes: Array<{
    postalCode: string;
    city: string;
  }>;
  hasData: boolean;
  dataQuality: 'excellent' | 'good' | 'none';
  lastUpdated: string;
  dataCollectedAt: string;
}

// Favorite kommuner - this could be stored in localStorage or user preferences
// Generic favorites - would be user-configurable in production
const favoriteKommuneIds: string[] = [];

function MunicipalitySearch({
  onSearch,
}: {
  onSearch: (term: string) => void;
}) {
  return (
    <div className="mb-6">
      <Input
        type="search"
        placeholder="Søk etter kommune..."
        className="max-w-sm"
        onChange={(e) => onSearch(e.target.value)}
      />
    </div>
  );
}

function NotificationBadge({ count }: { count: number }) {
  if (count === 0) return null;

  return (
    <Badge variant="destructive" className="ml-2 flex items-center gap-1">
      <Bell className="h-3 w-3" />
      {count}
    </Badge>
  );
}

function DataQualityBadge({ quality }: { quality: 'excellent' | 'good' | 'none' }) {
  const config = {
    excellent: { color: "bg-green-100 text-green-800", icon: "✅", text: "Komplett" },
    good: { color: "bg-yellow-100 text-yellow-800", icon: "⚡", text: "Delvis" },
    none: { color: "bg-gray-100 text-gray-800", icon: "📊", text: "Ingen data" },
  };
  
  const { color, icon, text } = config[quality];
  
  return (
    <Badge className={`${color} text-xs`}>
      {icon} {text}
    </Badge>
  );
}

function PriorityBadge({ priority }: { priority?: string }) {
  if (!priority) return null;
  
  const config = {
    high: { color: "bg-red-100 text-red-800", text: "Høy prioritet" },
    medium: { color: "bg-orange-100 text-orange-800", text: "Medium" },
    low: { color: "bg-blue-100 text-blue-800", text: "Lav" },
  };
  
  const { color, text } = config[priority as keyof typeof config] || config.medium;
  
  return (
    <Badge className={`${color} text-xs`}>
      {text}
    </Badge>
  );
}

function FavoriteKommuner({ kommuner }: { kommuner: EnhancedKommuneData[] }) {
  // Show high-priority kommuner with data as "favorites"
  const favoriteKommuner = kommuner
    .filter((k) => k.priority === 'high' || k.hasData)
    .slice(0, 8);

  if (favoriteKommuner.length === 0) {
    return (
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />
            Prioriterte kommuner
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-500 text-sm">
            Ingen prioriterte kommuner med data funnet.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />
          Prioriterte kommuner
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {favoriteKommuner.map((kommune) => (
            <Link
              key={kommune.id}
              href={`/kommune/${kommune.id}`}
              className="p-4 border rounded-lg hover:bg-gray-50 transition-colors"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="font-medium">{kommune.name}</div>
                  <DataQualityBadge quality={kommune.dataQuality} />
                </div>
                <div className="text-sm text-gray-500">
                  {kommune.id} • {kommune.county}
                </div>
                <div className="flex items-center gap-4 text-xs text-gray-600">
                  <div className="flex items-center gap-1">
                    <Building2 className="h-3 w-3" />
                    {kommune.companyCount}
                  </div>
                  <div className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {kommune.postalCodeCount}
                  </div>
                  {kommune.bankruptcyCount > 0 && (
                    <div className="flex items-center gap-1 text-red-600">
                      <AlertTriangle className="h-3 w-3" />
                      {kommune.bankruptcyCount}
                    </div>
                  )}
                </div>
                {kommune.priority && <PriorityBadge priority={kommune.priority} />}
              </div>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function MunicipalityList({ kommuner }: { kommuner: EnhancedKommuneData[] }) {
  if (kommuner.length === 0) {
    return (
      <div className="text-center py-8">
        <Database className="h-12 w-12 text-gray-300 mx-auto mb-4" />
        <h3 className="font-medium text-gray-900 mb-2">
          Ingen kommunedata tilgjengelig
        </h3>
        <p className="text-gray-500 text-sm">
          Systemet må kobles til Postgres database for å vise kommuner.
        </p>
      </div>
    );
  }

  return (
    <div className="max-h-96 overflow-y-auto border rounded-lg">
      <Table>
        <TableHeader className="sticky top-0 bg-white z-10">
          <TableRow>
            <TableHead>Kommune</TableHead>
            <TableHead>Fylke</TableHead>
            <TableHead>Selskaper</TableHead>
            <TableHead>Postnummer</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Konkurser</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {kommuner.map((kommune) => (
            <TableRow key={kommune.id} className={kommune.hasData ? '' : 'opacity-60'}>
              <TableCell>
                <div className="space-y-1">
                  <Link
                    href={`/kommune/${kommune.id}`}
                    className="text-blue-600 hover:text-blue-800 hover:underline font-medium flex items-center gap-2"
                  >
                    {kommune.name}
                    {kommune.priority && <PriorityBadge priority={kommune.priority} />}
                  </Link>
                  <div className="text-xs text-gray-500">
                    {kommune.id}
                    {kommune.region && ` • ${kommune.region}`}
                  </div>
                </div>
              </TableCell>
              <TableCell className="text-sm text-gray-600">
                {kommune.county}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <Building2 className="h-4 w-4 text-gray-400" />
                  <span className={kommune.companyCount > 0 ? 'font-medium' : 'text-gray-400'}>
                    {kommune.companyCount.toLocaleString()}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <MapPin className="h-4 w-4 text-gray-400" />
                  <span className={kommune.postalCodeCount > 0 ? 'font-medium' : 'text-gray-400'}>
                    {kommune.postalCodeCount}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                <DataQualityBadge quality={kommune.dataQuality} />
              </TableCell>
              <TableCell>
                {kommune.bankruptcyCount > 0 ? (
                  <div className="flex items-center gap-1">
                    <AlertTriangle className="h-4 w-4 text-red-500" />
                    <span className="text-red-600 font-medium">
                      {kommune.bankruptcyCount}
                    </span>
                  </div>
                ) : (
                  <span className="text-gray-400 text-sm">-</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// SWR fetcher function
const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.json();
};

export default function KommunerPage() {
  const [searchTerm, setSearchTerm] = useState("");

  // Use SWR for data fetching with caching and revalidation
  const {
    data: apiResponse,
    error,
    isLoading,
    mutate,
  } = useSWR("/api/kommuner", fetcher, {
    // Refresh data every 5 minutes
    refreshInterval: 5 * 60 * 1000,
    // Keep data fresh for 1 minute
    dedupingInterval: 60 * 1000,
    // Revalidate on focus
    revalidateOnFocus: true,
    // Retry on error
    errorRetryCount: 3,
    errorRetryInterval: 5000,
  });

  // Extract kommuner from API response
  const kommuner: EnhancedKommuneData[] = apiResponse?.kommuner || [];
  const stats = apiResponse?.stats;

  const filteredKommuner = kommuner.filter(
    (kommune) =>
      kommune.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      kommune.id.includes(searchTerm) ||
      kommune.county.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (error) {
    return (
      <div className="container mx-auto py-8">
        <h1 className="text-3xl font-bold mb-8">Kommuner i Norge</h1>
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Database className="h-5 w-5 text-red-600" />
              <div>
                <h3 className="font-semibold text-red-900">
                  Kunne ikke laste kommunedata
                </h3>
                <p className="text-red-800 text-sm">
                  Systemet er ikke koblet til Postgres database. Konfigurer
                  database-tilkobling for å vise kommuner.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">
          Kommuner i Norge
          {isLoading && (
            <RefreshCw className="inline-block ml-2 h-6 w-6 animate-spin text-gray-400" />
          )}
        </h1>
        <div className="text-right">
          <p className="text-gray-600">
            {apiResponse?.success
              ? `${apiResponse.count} kommuner`
              : "Ingen data"}
          </p>
          {stats && (
            <p className="text-sm text-gray-500">
              {stats.kommunerWithData} med data • {stats.totalCompanies.toLocaleString()} selskaper
            </p>
          )}
        </div>
      </div>

      {/* Statistics Overview */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Database className="h-8 w-8 text-blue-600" />
                <div>
                  <div className="text-2xl font-bold">{stats.kommunerWithData}</div>
                  <div className="text-sm text-gray-600">Kommuner med data</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Building2 className="h-8 w-8 text-green-600" />
                <div>
                  <div className="text-2xl font-bold">{stats.totalCompanies.toLocaleString()}</div>
                  <div className="text-sm text-gray-600">Totalt selskaper</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <MapPin className="h-8 w-8 text-purple-600" />
                <div>
                  <div className="text-2xl font-bold">{stats.totalPostalCodes.toLocaleString()}</div>
                  <div className="text-sm text-gray-600">Postnummer</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-8 w-8 text-red-600" />
                <div>
                  <div className="text-2xl font-bold">{stats.totalBankruptcies}</div>
                  <div className="text-sm text-gray-600">Konkurser</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Detective Feature Highlight */}
      <Card className="border-purple-200 bg-gradient-to-r from-purple-50 to-indigo-50 mb-6">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="text-4xl">🕵️‍♂️</div>
              <div>
                <h3 className="font-semibold text-lg text-purple-900">
                  Global Detektiv-Undersøkelse
                </h3>
                <p className="text-purple-700 text-sm">
                  Undersøk selskap og nettverk i hele Norge. Avdekk forbindelser
                  og risikofaktorer.
                </p>
              </div>
            </div>
            <Link href="/detective">
              <Button className="bg-purple-600 hover:bg-purple-700 text-white">
                <Search className="h-4 w-4 mr-2" />
                Start undersøkelse
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      <FavoriteKommuner kommuner={kommuner} />

      <Card>
        <CardHeader>
          <CardTitle>Alle kommuner</CardTitle>
        </CardHeader>
        <CardContent>
          <MunicipalitySearch onSearch={setSearchTerm} />
          <MunicipalityList kommuner={filteredKommuner} />
        </CardContent>
      </Card>
    </div>
  );
}
