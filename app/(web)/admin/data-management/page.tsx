"use client";

import { useState, useEffect } from "react";
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
import {
  RefreshCw,
  Database,
  Clock,
  CheckCircle,
  AlertCircle,
  Play,
  Square,
  Activity,
} from "lucide-react";

interface SchedulerStatus {
  isRunning: boolean;
  nextRun: string | null;
}

interface UpdateResult {
  success: boolean;
  kommunerUpdated?: number;
  totalGapsFilled?: number;
  totalRecordsAdded?: number;
  error?: string;
  timestamp?: string;
}

export default function DataManagementPage() {
  const [schedulerStatus, setSchedulerStatus] =
    useState<SchedulerStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<UpdateResult | null>(null);

  // Fetch scheduler status on component mount
  useEffect(() => {
    fetchSchedulerStatus();
  }, []);

  const fetchSchedulerStatus = async () => {
    try {
      const response = await fetch("/api/scheduler");
      const data = await response.json();
      if (data.success) {
        setSchedulerStatus({
          isRunning: data.isRunning,
          nextRun: data.nextRun,
        });
      }
    } catch (error) {
      console.error("Failed to fetch scheduler status:", error);
    }
  };

  const handleSchedulerAction = async (
    action: "start" | "stop" | "trigger"
  ) => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/scheduler", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      const result = await response.json();

      if (result.success) {
        if (action === "trigger") {
          setLastUpdate(result);
        }
        await fetchSchedulerStatus();
      } else {
        console.error("Scheduler action failed:", result.error);
      }
    } catch (error) {
      console.error("Scheduler action error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const triggerUpdateAll = async () => {
    try {
      const response = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "all" }),
      });

      const result = await response.json();
      setLastUpdate(result);
    } catch (error) {
      console.error("Update all failed:", error);
      setLastUpdate({
        success: false,
        error: "Failed to trigger update",
        timestamp: new Date().toISOString(),
      });
    }
  };

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Databehandling</h1>
          <p className="text-gray-600 mt-1">
            Administrer automatisk datainnhenting og oppdateringer
          </p>
        </div>
      </div>

      {/* Scheduler Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Planlagt oppdatering
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  <span>Status:</span>
                </div>
                {schedulerStatus ? (
                  <Badge
                    variant={
                      schedulerStatus.isRunning ? "default" : "secondary"
                    }
                  >
                    {schedulerStatus.isRunning ? "Aktiv" : "Inaktiv"}
                  </Badge>
                ) : (
                  <Badge variant="outline">Laster...</Badge>
                )}
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={() => handleSchedulerAction("start")}
                  disabled={isLoading || schedulerStatus?.isRunning}
                  size="sm"
                  variant="outline"
                >
                  <Play className="h-4 w-4 mr-2" />
                  Start
                </Button>
                <Button
                  onClick={() => handleSchedulerAction("stop")}
                  disabled={isLoading || !schedulerStatus?.isRunning}
                  size="sm"
                  variant="outline"
                >
                  <Square className="h-4 w-4 mr-2" />
                  Stopp
                </Button>
              </div>
            </div>

            {schedulerStatus?.nextRun && (
              <p className="text-sm text-gray-600">
                Neste kjøring: {schedulerStatus.nextRun}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Manual Updates */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Manuell oppdatering
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Trigger en fullstendig oppdatering av alle kommuner med en gang.
              Dette vil hente manglende data for alle kommuner.
            </p>

            <div className="flex gap-4">
              <Button
                onClick={() => handleSchedulerAction("trigger")}
                disabled={isLoading}
                className="flex items-center gap-2"
              >
                {isLoading ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Database className="h-4 w-4" />
                )}
                {isLoading ? "Oppdaterer..." : "Oppdater alle kommuner"}
              </Button>

              <Button
                onClick={triggerUpdateAll}
                disabled={isLoading}
                variant="outline"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Direkte oppdatering
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Last Update Results */}
      {lastUpdate && (
        <Card
          className={
            lastUpdate.success
              ? "border-green-200 bg-green-50"
              : "border-red-200 bg-red-50"
          }
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {lastUpdate.success ? (
                <CheckCircle className="h-5 w-5 text-green-600" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-600" />
              )}
              Siste oppdatering
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Status:</span>
                <Badge variant={lastUpdate.success ? "default" : "destructive"}>
                  {lastUpdate.success ? "Vellykket" : "Feilet"}
                </Badge>
              </div>

              {lastUpdate.success && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Kommuner oppdatert:</span>
                    <span className="text-sm font-mono">
                      {lastUpdate.kommunerUpdated}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Hull fylt:</span>
                    <span className="text-sm font-mono">
                      {lastUpdate.totalGapsFilled}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Poster lagt til:</span>
                    <span className="text-sm font-mono">
                      {lastUpdate.totalRecordsAdded}
                    </span>
                  </div>
                </>
              )}

              {lastUpdate.error && (
                <div className="text-sm text-red-600">
                  Feil: {lastUpdate.error}
                </div>
              )}

              {lastUpdate.timestamp && (
                <div className="text-xs text-gray-500 pt-2 border-t">
                  Tidspunkt:{" "}
                  {new Date(lastUpdate.timestamp).toLocaleString("nb-NO")}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* System Information */}
      <Card>
        <CardHeader>
          <CardTitle>Systeminformasjon</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Automatisk oppdatering:</span>
              <span>Hver dag kl. 02:00</span>
            </div>
            <div className="flex justify-between">
              <span>Dataperiode:</span>
              <span>Siste 12 måneder</span>
            </div>
            <div className="flex justify-between">
              <span>Cache-tid:</span>
              <span>5 minutter</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
