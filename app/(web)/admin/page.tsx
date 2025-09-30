"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Bell,
  BellRing,
  Mail,
  Smartphone,
  Search,
  Plus,
  Trash2,
  Settings,
  Star,
  Shield,
  AlertTriangle,
  TrendingUp,
  Target,
  Eye,
  RefreshCw,
} from "lucide-react";
import useSWR from "swr";

// Sample data - in production this would come from a user management system
const allKommuner = [
  { id: "4601", name: "Bergen", county: "Vestland" },
  { id: "1103", name: "Stavanger", county: "Rogaland" },
  { id: "5001", name: "Trondheim", county: "Trøndelag" },
  // Generic demo data - would be dynamic in production
  { id: "4203", name: "Arendal", county: "Agder" },
  { id: "4204", name: "Kristiansand", county: "Agder" },
  { id: "4205", name: "Gjerstad", county: "Agder" },
  { id: "4206", name: "Tvedestrand", county: "Agder" },
  { id: "4211", name: "Grimstad", county: "Agder" },
  { id: "4218", name: "Lillesand", county: "Agder" },
  { id: "4219", name: "Vennesla", county: "Agder" },
  { id: "4225", name: "Flekkefjord", county: "Agder" },
  { id: "4226", name: "Farsund", county: "Agder" },
  { id: "4227", name: "Lindesnes", county: "Agder" },
  { id: "5001", name: "Trondheim", county: "Trøndelag" },
  { id: "1601", name: "Bergen", county: "Vestland" },
];

interface NotificationSettings {
  email: boolean;
  push: boolean;
  sms: boolean;
}

interface FollowedKommune {
  id: string;
  name: string;
  county: string;
  notifications: NotificationSettings;
  dateAdded: string;
}

export default function AdminPage() {
  // Generic demo data - would load from user preferences in production
  const [followedKommuner, setFollowedKommuner] = useState<FollowedKommune[]>(
    []
  );

  const [searchTerm, setSearchTerm] = useState("");
  const [emailSettings, setEmailSettings] = useState({
    email: "user@example.com",
    frequency: "immediate", // immediate, daily, weekly
  });

  const availableKommuner = allKommuner.filter(
    (kommune) =>
      !followedKommuner.find((f) => f.id === kommune.id) &&
      (kommune.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        kommune.id.includes(searchTerm))
  );

  const addKommune = (kommune: (typeof allKommuner)[0]) => {
    const newFollowed: FollowedKommune = {
      ...kommune,
      notifications: { email: true, push: true, sms: false },
      dateAdded: new Date().toISOString().split("T")[0],
    };
    setFollowedKommuner([...followedKommuner, newFollowed]);
  };

  const removeKommune = (id: string) => {
    setFollowedKommuner(followedKommuner.filter((k) => k.id !== id));
  };

  const updateNotifications = (
    id: string,
    notifications: NotificationSettings
  ) => {
    setFollowedKommuner(
      followedKommuner.map((k) => (k.id === id ? { ...k, notifications } : k))
    );
  };

  // Fraud Detection Data
  const fetcher = async (url: string) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Failed to fetch");
    return response.json();
  };

  const { data: nationalFraudData, isLoading: fraudLoading } = useSWR(
    "/api/address-change-scanner",
    fetcher,
    { refreshInterval: 600000 } // Refresh every 10 minutes
  );

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Admin Panel</h1>
          <p className="text-gray-600 mt-1">
            Administrer kommune-abonnementer og varsler
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Settings className="h-4 w-4 mr-2" />
            Innstillinger
          </Button>
        </div>
      </div>

      {/* National Fraud Monitoring Dashboard */}
      <Card className="border-red-200 bg-gradient-to-r from-red-50 to-orange-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-800">
            <Shield className="h-6 w-6" />
            🚨 Nasjonal Svindelovervåking
          </CardTitle>
        </CardHeader>
        <CardContent>
          {fraudLoading ? (
            <div className="flex items-center gap-2 text-gray-500">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Analyserer svindelmønstre på landsbasis...
            </div>
          ) : nationalFraudData ? (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="text-center p-4 border border-red-200 rounded-lg bg-white">
                <div className="text-3xl font-bold text-red-600">
                  {nationalFraudData.scan?.fraudCases || 0}
                </div>
                <div className="text-sm text-red-700">Bekreftet Svindel</div>
                <div className="text-xs text-red-600">
                  Selskaper som flyttet før konkurs
                </div>
              </div>
              <div className="text-center p-4 border border-orange-200 rounded-lg bg-white">
                <div className="text-3xl font-bold text-orange-600">
                  {nationalFraudData.scan?.totalAddressChanges || 0}
                </div>
                <div className="text-sm text-orange-700">Adresseendringer</div>
                <div className="text-xs text-orange-600">Totalt overvåket</div>
              </div>
              <div className="text-center p-4 border border-yellow-200 rounded-lg bg-white">
                <div className="text-3xl font-bold text-yellow-600">
                  {nationalFraudData.scan?.criticalCases || 0}
                </div>
                <div className="text-sm text-yellow-700">Kritiske Saker</div>
                <div className="text-xs text-yellow-600">
                  Krever umiddelbar oppfølging
                </div>
              </div>
              <div className="text-center p-4 border border-purple-200 rounded-lg bg-white">
                <div className="text-3xl font-bold text-purple-600">
                  {nationalFraudData.analysis?.fraudRiskLevel || "LOW"}
                </div>
                <div className="text-sm text-purple-700">Risikonivå</div>
                <div className="text-xs text-purple-600">
                  Nasjonalt trusselsnivå
                </div>
              </div>
            </div>
          ) : (
            <div className="text-gray-500">Kunne ikke laste svindeldata</div>
          )}

          {nationalFraudData?.data?.fraudCases &&
            nationalFraudData.data.fraudCases.length > 0 && (
              <div>
                <h3 className="font-semibold text-red-800 mb-3 flex items-center gap-2">
                  <Target className="h-4 w-4" />
                  Topp Svindelsaker (Siste oppdaterte)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {nationalFraudData.data.fraudCases
                    .slice(0, 4)
                    .map((fraudCase: any, index: number) => (
                      <div
                        key={index}
                        className="border border-red-200 rounded-lg p-3 bg-white"
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <h4 className="font-semibold text-red-900 text-sm">
                              {fraudCase.companyName}
                            </h4>
                            <p className="text-xs text-red-700">
                              {fraudCase.oldAddress?.kommuneName} →{" "}
                              {fraudCase.newAddress?.kommuneName}
                            </p>
                            <p className="text-xs text-red-600">
                              Konkurs: {fraudCase.bankruptcyDate} • Org.nr:{" "}
                              {fraudCase.organizationNumber}
                            </p>
                          </div>
                          <Badge className="bg-red-600 text-white text-xs">
                            {fraudCase.fraudRiskLevel}
                          </Badge>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

          <div className="mt-4 pt-4 border-t border-red-200">
            <div className="flex justify-between items-center">
              <p className="text-sm text-red-700">
                Systemet overvåker{" "}
                {nationalFraudData?.scan?.totalAddressChanges || 0}{" "}
                adresseendringer på landsbasis
              </p>
              <Button
                variant="outline"
                size="sm"
                className="border-red-300 text-red-700"
              >
                <Eye className="h-4 w-4 mr-2" />
                Se Detaljert Rapport
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Email Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            E-post innstillinger
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">
                E-postadresse
              </label>
              <Input
                type="email"
                value={emailSettings.email}
                onChange={(e) =>
                  setEmailSettings({ ...emailSettings, email: e.target.value })
                }
                placeholder="din@epost.no"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">
                Varslingsfrekvens
              </label>
              <select
                className="w-full p-2 border rounded-md"
                value={emailSettings.frequency}
                onChange={(e) =>
                  setEmailSettings({
                    ...emailSettings,
                    frequency: e.target.value,
                  })
                }
              >
                <option value="immediate">Umiddelbart</option>
                <option value="daily">Daglig sammendrag</option>
                <option value="weekly">Ukentlig sammendrag</option>
              </select>
            </div>
          </div>
          <Button>Lagre e-post innstillinger</Button>
        </CardContent>
      </Card>

      {/* Followed Kommuner */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="h-5 w-5 text-yellow-500" />
            Fulgte kommuner ({followedKommuner.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {followedKommuner.length === 0 ? (
            <p className="text-gray-500 text-center py-8">
              Du følger ingen kommuner ennå. Legg til kommuner nedenfor.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kommune</TableHead>
                    <TableHead>Fylke</TableHead>
                    <TableHead>Lagt til</TableHead>
                    <TableHead>Varsler</TableHead>
                    <TableHead>Handlinger</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {followedKommuner.map((kommune) => (
                    <TableRow key={kommune.id}>
                      <TableCell className="font-medium">
                        <div>
                          <div>{kommune.name}</div>
                          <div className="text-sm text-gray-500">
                            {kommune.id}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{kommune.county}</TableCell>
                      <TableCell>
                        {new Date(kommune.dateAdded).toLocaleDateString(
                          "nb-NO"
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant={
                              kommune.notifications.email
                                ? "default"
                                : "outline"
                            }
                            onClick={() =>
                              updateNotifications(kommune.id, {
                                ...kommune.notifications,
                                email: !kommune.notifications.email,
                              })
                            }
                          >
                            <Mail className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant={
                              kommune.notifications.push ? "default" : "outline"
                            }
                            onClick={() =>
                              updateNotifications(kommune.id, {
                                ...kommune.notifications,
                                push: !kommune.notifications.push,
                              })
                            }
                          >
                            <Bell className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant={
                              kommune.notifications.sms ? "default" : "outline"
                            }
                            onClick={() =>
                              updateNotifications(kommune.id, {
                                ...kommune.notifications,
                                sms: !kommune.notifications.sms,
                              })
                            }
                          >
                            <Smartphone className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => removeKommune(kommune.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add New Kommune */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Legg til nye kommuner
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="flex-1">
                <Input
                  type="search"
                  placeholder="Søk etter kommune..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full"
                />
              </div>
            </div>

            {searchTerm && (
              <div className="max-h-64 overflow-y-auto border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Kommune</TableHead>
                      <TableHead>Fylke</TableHead>
                      <TableHead>Handling</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {availableKommuner.slice(0, 10).map((kommune) => (
                      <TableRow key={kommune.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{kommune.name}</div>
                            <div className="text-sm text-gray-500">
                              {kommune.id}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{kommune.county}</TableCell>
                        <TableCell>
                          <Button size="sm" onClick={() => addKommune(kommune)}>
                            <Plus className="h-3 w-3 mr-1" />
                            Følg
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Notification Statistics */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BellRing className="h-5 w-5" />
            Varsel-statistikk
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center p-4 border rounded-lg">
              <div className="text-2xl font-bold text-blue-600">24</div>
              <div className="text-sm text-gray-600">Varsler denne uken</div>
            </div>
            <div className="text-center p-4 border rounded-lg">
              <div className="text-2xl font-bold text-green-600">12</div>
              <div className="text-sm text-gray-600">Konkurser oppdaget</div>
            </div>
            <div className="text-center p-4 border rounded-lg">
              <div className="text-2xl font-bold text-orange-600">8</div>
              <div className="text-sm text-gray-600">Adresseendringer</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
