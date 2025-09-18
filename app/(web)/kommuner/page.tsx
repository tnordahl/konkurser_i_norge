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
import { Star, Bell } from "lucide-react";
import { useState } from "react";

// Extended data for development - in production this would come from Sanity
const favoriteKommuner = [
  { id: "4201", name: "Risør", notifications: 2 },
  { id: "4205", name: "Gjerstad", notifications: 0 },
  { id: "4206", name: "Tvedestrand", notifications: 1 },
  { id: "4203", name: "Arendal", notifications: 5 },
];

const allKommuner = [
  { id: "0301", name: "Oslo", notifications: 45 },
  { id: "1101", name: "Eigersund", notifications: 2 },
  { id: "1103", name: "Stavanger", notifications: 12 },
  { id: "1106", name: "Haugesund", notifications: 8 },
  { id: "1111", name: "Sokndal", notifications: 0 },
  { id: "1112", name: "Lund", notifications: 1 },
  { id: "1114", name: "Bjerkreim", notifications: 0 },
  { id: "1119", name: "Hå", notifications: 3 },
  { id: "1120", name: "Klepp", notifications: 2 },
  { id: "1121", name: "Time", notifications: 4 },
  { id: "1122", name: "Gjesdal", notifications: 1 },
  { id: "1124", name: "Sola", notifications: 6 },
  { id: "1125", name: "Randaberg", notifications: 2 },
  { id: "1127", name: "Strand", notifications: 3 },
  { id: "1129", name: "Forsand", notifications: 0 },
  { id: "1130", name: "Sandnes", notifications: 18 },
  { id: "1133", name: "Hjelmeland", notifications: 1 },
  { id: "1134", name: "Suldal", notifications: 2 },
  { id: "1135", name: "Sauda", notifications: 1 },
  { id: "1144", name: "Kvitsøy", notifications: 0 },
  { id: "4201", name: "Risør", notifications: 2 },
  { id: "4203", name: "Arendal", notifications: 5 },
  { id: "4204", name: "Kristiansand", notifications: 22 },
  { id: "4205", name: "Gjerstad", notifications: 0 },
  { id: "4206", name: "Tvedestrand", notifications: 1 },
  { id: "4207", name: "Vegårshei", notifications: 0 },
  { id: "4211", name: "Grimstad", notifications: 7 },
  { id: "4212", name: "Bykle", notifications: 0 },
  { id: "4213", name: "Iveland", notifications: 0 },
  { id: "4214", name: "Evje og Hornnes", notifications: 1 },
  { id: "4215", name: "Bygland", notifications: 0 },
  { id: "4216", name: "Valle", notifications: 0 },
  { id: "4217", name: "Birkenes", notifications: 2 },
  { id: "4218", name: "Lillesand", notifications: 3 },
  { id: "4219", name: "Vennesla", notifications: 4 },
  { id: "4220", name: "Åseral", notifications: 0 },
  { id: "4221", name: "Lyngdal", notifications: 2 },
  { id: "4222", name: "Hægebostad", notifications: 0 },
  { id: "4223", name: "Kvinesdal", notifications: 1 },
  { id: "4224", name: "Sirdal", notifications: 0 },
  { id: "4225", name: "Flekkefjord", notifications: 4 },
  { id: "4226", name: "Farsund", notifications: 3 },
  { id: "4227", name: "Lindesnes", notifications: 2 },
];

function MunicipalitySearch({ onSearch }: { onSearch: (term: string) => void }) {
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

function FavoriteKommuner() {
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
                <div className="text-sm text-gray-500">{kommune.id}</div>
              </div>
              <NotificationBadge count={kommune.notifications} />
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function MunicipalityList({ kommuner }: { kommuner: typeof allKommuner }) {
  return (
    <div className="max-h-96 overflow-y-auto border rounded-lg">
      <Table>
        <TableHeader className="sticky top-0 bg-white z-10">
          <TableRow>
            <TableHead>Kommunenummer</TableHead>
            <TableHead>Navn</TableHead>
            <TableHead>Varsler</TableHead>
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
                  <NotificationBadge count={kommune.notifications} />
                </Link>
              </TableCell>
              <TableCell>
                {kommune.notifications > 0 && (
                  <span className="text-sm text-gray-600">
                    {kommune.notifications} nye hendelser
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

export default function KommunerPage() {
  const [searchTerm, setSearchTerm] = useState("");
  
  const filteredKommuner = allKommuner.filter(
    (kommune) =>
      kommune.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      kommune.id.includes(searchTerm)
  );

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-8">Kommuner i Norge</h1>
      
      <FavoriteKommuner />
      
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
