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
import { Star, Bell, Database, RefreshCw } from "lucide-react";
import { useState } from "react";
import { KommuneData } from "@/lib/data-fetcher";
import useSWR from "swr";

// Favorite kommuner - this could be stored in localStorage or user preferences
const favoriteKommuneIds = ["4201", "4203", "0301", "1103"];

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

function FavoriteKommuner({ kommuner }: { kommuner: KommuneData[] }) {
  const favoriteKommuner = kommuner.filter((k) =>
    favoriteKommuneIds.includes(k.id)
  );

  if (favoriteKommuner.length === 0) {
    return (
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />
            Favoritter
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-500 text-sm">
            Ingen favoritt-kommuner funnet. Data lastes når systemet kobles til
            database.
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
          Favoritter
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {favoriteKommuner.map((kommune) => (
            <Link
              key={kommune.id}
              href={`/kommune/${kommune.id}`}
              className="p-4 border rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-between"
            >
              <div>
                <div className="font-medium">{kommune.name}</div>
                <div className="text-sm text-gray-500">
                  {kommune.id} • {kommune.county}
                </div>
              </div>
              <NotificationBadge count={kommune.bankruptcyCount} />
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function MunicipalityList({ kommuner }: { kommuner: KommuneData[] }) {
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
            <TableHead>Kommunenummer</TableHead>
            <TableHead>Navn</TableHead>
            <TableHead>Fylke</TableHead>
            <TableHead>Konkurser</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {kommuner.map((kommune) => (
            <TableRow key={kommune.id}>
              <TableCell>{kommune.id}</TableCell>
              <TableCell>
                <Link
                  href={`/kommune/${kommune.id}`}
                  className="text-blue-600 hover:text-blue-800 hover:underline flex items-center"
                >
                  {kommune.name}
                  <NotificationBadge count={kommune.bankruptcyCount} />
                </Link>
              </TableCell>
              <TableCell className="text-sm text-gray-600">
                {kommune.county}
              </TableCell>
              <TableCell>
                {kommune.bankruptcyCount > 0 && (
                  <span className="text-sm text-gray-600">
                    {kommune.bankruptcyCount} registrerte
                  </span>
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
  const kommuner: KommuneData[] = apiResponse?.kommuner || [];

  const filteredKommuner = kommuner.filter(
    (kommune) =>
      kommune.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      kommune.id.includes(searchTerm)
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
        <p className="text-gray-600">
          {apiResponse?.success
            ? `${apiResponse.count} kommuner`
            : "Ingen data"}
        </p>
      </div>

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
