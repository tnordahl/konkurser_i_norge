"use client";

import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  BarChart3,
  Database,
  Settings,
  AlertTriangle,
  TrendingUp,
  Users,
  Building2,
  ExternalLink,
} from "lucide-react";

export default function DashboardPage() {
  return (
    <div className="container mx-auto py-8 space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">System Dashboard</h1>
          <p className="text-gray-600 mt-1">
            Administrer konkurssystemet og overvåk datainnsamling
          </p>
        </div>
      </div>

      {/* System Not Configured Warning */}
      <Card className="border-red-200 bg-red-50">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold text-red-900">
                System ikke konfigurert
              </h3>
              <p className="text-red-800 text-sm mt-1">
                Systemet viser ingen data fordi det ikke er koblet til
                datakilder. Konfigurer Sanity CMS og API-tilkoblinger for å
                aktivere full funksjonalitet.
              </p>
              <Link href="/admin/setup" className="inline-block mt-3">
                <Button
                  size="sm"
                  variant="outline"
                  className="border-red-300 text-red-700 hover:bg-red-100"
                >
                  <Settings className="h-4 w-4 mr-2" />
                  Gå til setup-guide
                </Button>
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* System Status - Real Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Systemstatus
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex justify-between items-center p-3 bg-red-50 rounded-lg">
              <span className="font-medium">Sanity CMS</span>
              <Badge variant="destructive">Ikke konfigurert</Badge>
            </div>
            <div className="flex justify-between items-center p-3 bg-red-50 rounded-lg">
              <span className="font-medium">API-tilkobling</span>
              <Badge variant="destructive">Ikke tilkoblet</Badge>
            </div>
            <div className="flex justify-between items-center p-3 bg-yellow-50 rounded-lg">
              <span className="font-medium">Scheduler</span>
              <Badge variant="secondary">Deaktivert</Badge>
            </div>
            <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
              <span className="font-medium">Applikasjon</span>
              <Badge variant="default">Kjører</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Setup Guide</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 mb-4">
              Følg veiledningen for å konfigurere systemet og koble til
              datakilder.
            </p>
            <Link href="/admin/setup">
              <Button className="w-full">
                <Settings className="h-4 w-4 mr-2" />
                Start setup
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Databehandling</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 mb-4">
              Administrer automatisk datainnhenting og oppdateringer (krever
              konfigurering).
            </p>
            <Link href="/admin/data-management">
              <Button variant="outline" className="w-full">
                <Database className="h-4 w-4 mr-2" />
                Databehandling
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Demo</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 mb-4">
              Se hvordan systemet vil fungere når det er fullt konfigurert.
            </p>
            <Link href="/admin/data-demo">
              <Button variant="outline" className="w-full">
                <BarChart3 className="h-4 w-4 mr-2" />
                Se demo
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Documentation Links */}
      <Card>
        <CardHeader>
          <CardTitle>Ressurser</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <a
              href="https://sanity.io/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50"
            >
              <span className="font-medium">Sanity CMS Dokumentasjon</span>
              <ExternalLink className="h-4 w-4 text-gray-400" />
            </a>
            <a
              href="https://data.brreg.no/konkurs/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50"
            >
              <span className="font-medium">Brønnøysund API</span>
              <ExternalLink className="h-4 w-4 text-gray-400" />
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

