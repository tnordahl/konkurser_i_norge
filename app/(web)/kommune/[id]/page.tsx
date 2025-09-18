"use client";

import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { AlertTriangle, Building2, MapPin, Calendar, TrendingUp } from "lucide-react";

// Sample data - in production this would come from Sanity CMS
const kommuneData: Record<string, any> = {
  "4201": {
    name: "Risør",
    county: "Agder",
    population: 6847,
    bankruptcies: [
      {
        id: "1",
        companyName: "Risør Marina AS",
        organizationNumber: "987654321",
        bankruptcyDate: "2024-08-15",
        address: "Strandgata 12, 4950 Risør",
        industry: "Marinavirksomhet",
        hasRecentAddressChange: true,
        previousAddress: "Havnegata 5, 4950 Risør"
      },
      {
        id: "2",
        companyName: "Coastal Consulting AS",
        organizationNumber: "123456789",
        bankruptcyDate: "2024-07-22",
        address: "Torvet 8, 4950 Risør",
        industry: "Konsulentvirksomhet",
        hasRecentAddressChange: false
      }
    ],
    addressChanges: [
      {
        id: "1",
        companyName: "Risør Seafood AS",
        organizationNumber: "555666777",
        changeDate: "2024-09-01",
        fromAddress: "Industriveien 15, 4950 Risør",
        toAddress: "Havnegata 22, 4900 Tvedestrand",
        direction: "out"
      },
      {
        id: "2",
        companyName: "Nordic Solutions AS",
        organizationNumber: "888999000",
        changeDate: "2024-08-20",
        fromAddress: "Storgata 45, 4900 Tvedestrand",
        toAddress: "Kirkegata 12, 4950 Risør",
        direction: "in"
      }
    ]
  },
  "4203": {
    name: "Arendal",
    county: "Agder",
    population: 46773,
    bankruptcies: [
      {
        id: "3",
        companyName: "Arendal Transport AS",
        organizationNumber: "111222333",
        bankruptcyDate: "2024-09-10",
        address: "Industriveien 45, 4848 Arendal",
        industry: "Transport og logistikk",
        hasRecentAddressChange: true,
        previousAddress: "Havnegata 12, 4900 Tvedestrand"
      }
    ],
    addressChanges: [
      {
        id: "3",
        companyName: "South Coast Tech AS",
        organizationNumber: "444555666",
        changeDate: "2024-08-30",
        fromAddress: "Teglverksveien 8, 4848 Arendal",
        toAddress: "Storgata 15, 4612 Kristiansand",
        direction: "out"
      }
    ]
  }
};

// Default data for unknown kommuner
const getKommuneInfo = (id: string) => {
  return kommuneData[id] || {
    name: `Kommune ${id}`,
    county: "Ukjent",
    population: 0,
    bankruptcies: [],
    addressChanges: []
  };
};

function AlertCard({ bankruptcy }: { bankruptcy: any }) {
  if (!bankruptcy.hasRecentAddressChange) return null;
  
  return (
    <Card className="border-red-200 bg-red-50">
      <CardContent className="pt-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
          <div>
            <h4 className="font-semibold text-red-900">Adressevarsel</h4>
            <p className="text-red-800 text-sm">
              <strong>{bankruptcy.companyName}</strong> endret adresse ut av kommunen innen siste år før konkurs.
            </p>
            <p className="text-red-700 text-xs mt-1">
              Tidligere adresse: {bankruptcy.previousAddress}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function BankruptciesSection({ bankruptcies }: { bankruptcies: any[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          Siste konkurser ({bankruptcies.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        {bankruptcies.length === 0 ? (
          <p className="text-gray-500">Ingen konkurser registrert</p>
        ) : (
          <div className="space-y-4">
            {bankruptcies.map((bankruptcy) => (
              <div key={bankruptcy.id}>
                <AlertCard bankruptcy={bankruptcy} />
                <div className="border rounded-lg p-4 mt-2">
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-semibold">{bankruptcy.companyName}</h4>
                    <Badge variant="destructive">Konkurs</Badge>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-gray-600">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      {new Date(bankruptcy.bankruptcyDate).toLocaleDateString('nb-NO')}
                    </div>
                    <div className="flex items-center gap-1">
                      <MapPin className="h-4 w-4" />
                      {bankruptcy.address}
                    </div>
                    <div>Org.nr: {bankruptcy.organizationNumber}</div>
                    <div>Bransje: {bankruptcy.industry}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AddressChangesSection({ addressChanges }: { addressChanges: any[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Adresseendringer ({addressChanges.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        {addressChanges.length === 0 ? (
          <p className="text-gray-500">Ingen adresseendringer registrert</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Selskap</TableHead>
                  <TableHead>Dato</TableHead>
                  <TableHead>Fra adresse</TableHead>
                  <TableHead>Til adresse</TableHead>
                  <TableHead>Retning</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {addressChanges.map((change) => (
                  <TableRow key={change.id}>
                    <TableCell className="font-medium">
                      {change.companyName}
                    </TableCell>
                    <TableCell>
                      {new Date(change.changeDate).toLocaleDateString('nb-NO')}
                    </TableCell>
                    <TableCell className="text-sm">{change.fromAddress}</TableCell>
                    <TableCell className="text-sm">{change.toAddress}</TableCell>
                    <TableCell>
                      <Badge 
                        variant={change.direction === "in" ? "default" : "secondary"}
                      >
                        {change.direction === "in" ? "Inn til kommune" : "Ut av kommune"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function KommunePage({
  params: { id },
}: {
  params: { id: string };
}) {
  const kommune = getKommuneInfo(id);
  const hasAlerts = kommune.bankruptcies.some((b: any) => b.hasRecentAddressChange);

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">{kommune.name}</h1>
          <p className="text-gray-600 mt-1">
            {kommune.county} • {kommune.population.toLocaleString('nb-NO')} innbyggere
          </p>
        </div>
        <Link
          href="/kommuner"
          className="text-blue-600 hover:text-blue-800 hover:underline"
        >
          ← Tilbake til kommuneliste
        </Link>
      </div>

      {hasAlerts && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              <div>
                <h3 className="font-semibold text-amber-900">Adressevarsler aktive</h3>
                <p className="text-amber-800 text-sm">
                  Det er registrert konkurser med nylige adresseendringer ut av kommunen.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Abonnér på varsler</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-x-4">
            <Button>E-post varsling</Button>
            <Button variant="outline">Web Push</Button>
          </div>
        </CardContent>
      </Card>

      <BankruptciesSection bankruptcies={kommune.bankruptcies} />
      
      <AddressChangesSection addressChanges={kommune.addressChanges} />
    </div>
  );
}
