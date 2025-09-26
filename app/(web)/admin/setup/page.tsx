"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Database,
  Settings,
  ExternalLink,
  Copy,
} from "lucide-react";

export default function SetupPage() {
  const [setupStatus, setSetupStatus] = useState({
    sanityConfigured: false,
    apiConnected: false,
    schedulerEnabled: false,
  });

  useEffect(() => {
    // Check if Sanity is configured by looking for project ID
    const sanityConfigured = !!(
      process.env.NEXT_PUBLIC_SANITY_PROJECT_ID &&
      process.env.NEXT_PUBLIC_SANITY_PROJECT_ID !== "your_project_id_here"
    );

    setSetupStatus({
      sanityConfigured,
      apiConnected: false, // This would check actual API connectivity
      schedulerEnabled: process.env.ENABLE_SCHEDULER === "true",
    });
  }, []);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const envTemplate = `# Database Configuration - Vercel Postgres (for bankruptcy data)
POSTGRES_URL="postgresql://username:password@host:port/database"
POSTGRES_PRISMA_URL="postgresql://username:password@host:port/database?pgbouncer=true&connect_timeout=15"
POSTGRES_URL_NON_POOLING="postgresql://username:password@host:port/database"
POSTGRES_USER="username"
POSTGRES_HOST="host"
POSTGRES_PASSWORD="password"
POSTGRES_DATABASE="database"

# Sanity CMS Configuration (for content management)
NEXT_PUBLIC_SANITY_PROJECT_ID=your_sanity_project_id
NEXT_PUBLIC_SANITY_DATASET=production
NEXT_PUBLIC_SANITY_API_VERSION=2024-01-01
SANITY_API_TOKEN=your_sanity_api_token_with_write_permissions

# Norwegian Bankruptcy Registry API
BANKRUPTCY_API_URL=https://api.brreg.no/

# Vercel Cron Configuration
CRON_SECRET=your_secure_random_string

# Monitoring (optional)
MONITORING_WEBHOOK_URL=https://your-monitoring-service.com/webhook`;

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">System Setup</h1>
          <p className="text-gray-600 mt-1">
            Konfigurer systemet for å koble til datakilder og aktivere
            automatiske oppdateringer
          </p>
        </div>
      </div>

      {/* Setup Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card
          className={
            setupStatus.sanityConfigured
              ? "border-green-200 bg-green-50"
              : "border-red-200 bg-red-50"
          }
        >
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              {setupStatus.sanityConfigured ? (
                <CheckCircle className="h-8 w-8 text-green-600" />
              ) : (
                <XCircle className="h-8 w-8 text-red-600" />
              )}
              <div>
                <h3 className="font-semibold text-lg">Sanity CMS</h3>
                <p className="text-sm text-gray-600">
                  {setupStatus.sanityConfigured
                    ? "Konfigurert"
                    : "Ikke konfigurert"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-8 w-8 text-yellow-600" />
              <div>
                <h3 className="font-semibold text-lg">API Tilkobling</h3>
                <p className="text-sm text-gray-600">Ikke konfigurert</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card
          className={
            setupStatus.schedulerEnabled
              ? "border-green-200 bg-green-50"
              : "border-yellow-200 bg-yellow-50"
          }
        >
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              {setupStatus.schedulerEnabled ? (
                <CheckCircle className="h-8 w-8 text-green-600" />
              ) : (
                <AlertTriangle className="h-8 w-8 text-yellow-600" />
              )}
              <div>
                <h3 className="font-semibold text-lg">Scheduler</h3>
                <p className="text-sm text-gray-600">
                  {setupStatus.schedulerEnabled ? "Aktivert" : "Deaktivert"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Setup Instructions */}
      <div className="space-y-6">
        {/* Step 1: Database Setup */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Steg 1: Database Setup (Vercel Postgres for data)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h4 className="font-semibold text-green-900 mb-2">
                🗄️ Vercel Postgres (for konkursdata)
              </h4>
              <p className="text-green-800 text-sm mb-3">
                Postgres håndterer all konkursdata, adresseendringer og
                historikk.
              </p>
              <ol className="text-green-800 text-sm space-y-1 ml-4 list-decimal">
                <li>Gå til Vercel Dashboard → Storage → Create Database</li>
                <li>Velg &quot;Postgres&quot; og opprett databasen</li>
                <li>Kopier alle connection strings fra .env.local tab</li>
                <li>
                  Kjør{" "}
                  <code className="bg-green-100 px-1 rounded">
                    npx prisma migrate dev
                  </code>
                </li>
              </ol>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-semibold text-blue-900 mb-2">
                📄 Sanity CMS (for innhold og sider)
              </h4>
              <p className="text-blue-800 text-sm mb-3">
                Sanity håndterer statisk innhold, kommune-beskrivelser og
                redaksjonelt innhold.
              </p>
              <ol className="text-blue-800 text-sm space-y-1 ml-4 list-decimal">
                <li>
                  Gå til{" "}
                  <a
                    href="https://sanity.io"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    sanity.io
                  </a>{" "}
                  og opprett prosjekt
                </li>
                <li>
                  Deploy schemas:{" "}
                  <code className="bg-blue-100 px-1 rounded">
                    npx sanity deploy
                  </code>
                </li>
                <li>Opprett API token med write-tilgang</li>
              </ol>
            </div>
          </CardContent>
        </Card>

        {/* Step 2: Environment Variables */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Steg 2: Konfigurer miljøvariabler
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-600">
              Opprett en <code>.env.local</code> fil i prosjektets rot-mappe med
              følgende innhold:
            </p>

            <div className="relative">
              <pre className="bg-gray-100 p-4 rounded-lg text-sm overflow-x-auto">
                <code>{envTemplate}</code>
              </pre>
              <Button
                onClick={() => copyToClipboard(envTemplate)}
                size="sm"
                variant="outline"
                className="absolute top-2 right-2"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-semibold text-blue-900 mb-2">
                💡 Viktige notater:
              </h4>
              <ul className="text-blue-800 text-sm space-y-1">
                <li>
                  • Erstatt alle &quot;your_*&quot; verdier med dine faktiske verdier
                </li>
                <li>• SANITY_API_TOKEN må ha write-tilgang</li>
                <li>• CRON_SECRET bør være en sikker, tilfeldig streng</li>
                <li>
                  • Start applikasjonen på nytt etter å ha opprettet .env.local
                </li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Step 3: API Integration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ExternalLink className="h-5 w-5" />
              Steg 3: Koble til norske API-er
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <h4 className="font-semibold">Brønnøysundregistrene API</h4>
              <p className="text-sm text-gray-600">
                Systemet kan kobles til Brønnøysundregistrenes åpne API for
                konkursdata.
              </p>
              <a
                href="https://data.brreg.no/konkurs/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-blue-600 hover:underline text-sm"
              >
                Se API dokumentasjon <ExternalLink className="h-3 w-3" />
              </a>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <h4 className="font-semibold text-yellow-900 mb-2">
                ⚠️ Implementasjon påkrevd:
              </h4>
              <p className="text-yellow-800 text-sm">
                API-integrasjonen må implementeres i{" "}
                <code>lib/data-fetcher.ts</code> funksjonen
                <code>fetchBankruptcyDataFromExternalAPI</code>. Dette er for
                øyeblikket en placeholder.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Step 4: Testing */}
        <Card>
          <CardHeader>
            <CardTitle>Steg 4: Test systemet</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <h4 className="font-semibold">Etter konfigurering:</h4>
              <ul className="text-sm text-gray-600 space-y-1 ml-4">
                <li>1. Start applikasjonen på nytt</li>
                <li>
                  2. Gå til{" "}
                  <a
                    href="/admin/data-management"
                    className="text-blue-600 hover:underline"
                  >
                    Data Management
                  </a>{" "}
                  for å teste oppdateringer
                </li>
                <li>3. Besøk en kommune-side for å se om data lastes</li>
                <li>4. Sjekk at scheduler er aktivert</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Current Status Warning */}
      {!setupStatus.sanityConfigured && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              <div>
                <h3 className="font-semibold text-amber-900">
                  System ikke konfigurert
                </h3>
                <p className="text-amber-800 text-sm">
                  Systemet viser for øyeblikket ingen data fordi Sanity CMS ikke
                  er konfigurert. Følg instruksjonene ovenfor for å aktivere
                  full funksjonalitet.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
