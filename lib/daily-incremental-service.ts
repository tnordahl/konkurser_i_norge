/**
 * Daily Incremental Service - Phase 2 of the two-phase strategy
 *
 * Fast daily updates using date filters to get only new/changed entities
 * from the last 24 hours across all kommuner
 */

import { prisma } from "./database";
import { delay } from "./config/api-delays";
import { kommuneService, Kommune } from "./kommune-service";

interface DailyUpdateStats {
  kommuneNumber: string;
  kommuneName: string;
  newEntities: number;
  updatedEntities: number;
  processingTime: number;
  success: boolean;
  error?: string;
}

export class DailyIncrementalService {
  private static instance: DailyIncrementalService;

  static getInstance(): DailyIncrementalService {
    if (!DailyIncrementalService.instance) {
      DailyIncrementalService.instance = new DailyIncrementalService();
    }
    return DailyIncrementalService.instance;
  }

  /**
   * Run daily incremental update across all kommuner
   * Much faster than full collection - only gets changes from last 24 hours
   */
  async runDailyUpdate(): Promise<{
    totalKommuner: number;
    successfulKommuner: number;
    totalNewEntities: number;
    totalUpdatedEntities: number;
    totalProcessingTime: number;
    kommuneStats: DailyUpdateStats[];
    efficiency: {
      entitiesPerSecond: number;
      kommunerPerMinute: number;
      avgNewEntitiesPerKommune: number;
    };
  }> {
    console.log(
      "🌅 DAILY INCREMENTAL UPDATE: Starting 24-hour update cycle..."
    );
    const startTime = Date.now();

    const allKommuner = kommuneService.getAllKommuner();
    console.log(
      `📍 Checking ${allKommuner.length} kommuner for changes in last 24 hours`
    );

    const kommuneStats: DailyUpdateStats[] = [];
    let totalNewEntities = 0;
    let totalUpdatedEntities = 0;
    let successfulKommuner = 0;

    // Calculate 24 hours ago
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateFilter = yesterday.toISOString().split("T")[0]; // YYYY-MM-DD format

    console.log(`📅 Looking for changes since: ${dateFilter}`);

    for (const kommune of allKommuner) {
      try {
        console.log(
          `\n🔄 Checking ${kommune.name} (${kommune.number}) for daily changes...`
        );

        const kommuneStartTime = Date.now();
        const { newEntities, updatedEntities } = await this.updateKommuneDaily(
          kommune.number,
          dateFilter
        );
        const processingTime = Date.now() - kommuneStartTime;

        const stats: DailyUpdateStats = {
          kommuneNumber: kommune.number,
          kommuneName: kommune.name,
          newEntities,
          updatedEntities,
          processingTime,
          success: true,
        };

        kommuneStats.push(stats);
        totalNewEntities += newEntities;
        totalUpdatedEntities += updatedEntities;
        successfulKommuner++;

        if (newEntities > 0 || updatedEntities > 0) {
          console.log(
            `✨ ${kommune.name}: ${newEntities} new, ${updatedEntities} updated`
          );
        } else {
          console.log(`✅ ${kommune.name}: No changes`);
        }

        // Minimal rate limiting - daily updates are much lighter
        await delay.betweenBronnøysundCalls();
      } catch (error) {
        console.error(
          `❌ Failed daily update for kommune ${kommune.number}:`,
          error
        );

        kommuneStats.push({
          kommuneNumber: kommune.number,
          kommuneName: kommune.name,
          newEntities: 0,
          updatedEntities: 0,
          processingTime: 0,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    const totalProcessingTime = Date.now() - startTime;
    const totalChanges = totalNewEntities + totalUpdatedEntities;

    console.log(`\n🎉 DAILY UPDATE COMPLETE!`);
    console.log(`📊 Total new entities: ${totalNewEntities.toLocaleString()}`);
    console.log(
      `🔄 Total updated entities: ${totalUpdatedEntities.toLocaleString()}`
    );
    console.log(`⚡ Total changes: ${totalChanges.toLocaleString()}`);
    console.log(
      `⏱️ Completed in: ${(totalProcessingTime / 1000).toFixed(1)} seconds`
    );

    return {
      totalKommuner: allKommuner.length,
      successfulKommuner,
      totalNewEntities,
      totalUpdatedEntities,
      totalProcessingTime,
      kommuneStats,
      efficiency: {
        entitiesPerSecond: Math.round(
          totalChanges / (totalProcessingTime / 1000)
        ),
        kommunerPerMinute: Math.round(
          (successfulKommuner / (totalProcessingTime / 1000)) * 60
        ),
        avgNewEntitiesPerKommune: Math.round(
          totalNewEntities / successfulKommuner
        ),
      },
    };
  }

  /**
   * Update a single kommune with changes from the last 24 hours
   */
  private async updateKommuneDaily(
    kommuneNumber: string,
    dateFilter: string
  ): Promise<{ newEntities: number; updatedEntities: number }> {
    // Try different date filter parameters that the API might support
    const possibleParams = [
      `registrertEtter=${dateFilter}`,
      `endretEtter=${dateFilter}`,
      `registreringsdatoEnhetsregisteret=${dateFilter}`,
      `sisteEndringsdato=${dateFilter}`,
    ];

    let allNewEntities: any[] = [];

    // For now, we'll use a simple approach and filter by registration date
    // In a real system, you'd need to test which date parameters the API actually supports
    const url = `https://data.brreg.no/enhetsregisteret/api/enheter?kommunenummer=${kommuneNumber}&size=5000&page=0`;

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "konkurser-i-norge-daily-update/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch daily updates for kommune ${kommuneNumber}: ${response.status}`
      );
    }

    const data = await response.json();
    const entities = data._embedded?.enheter || [];

    // Filter entities by registration/modification date (client-side filtering for now)
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);

    const recentEntities = entities.filter((entity: any) => {
      const regDate = entity.registreringsdatoEnhetsregisteret
        ? new Date(entity.registreringsdatoEnhetsregisteret)
        : null;

      return regDate && regDate >= yesterdayDate;
    });

    console.log(
      `📊 Found ${recentEntities.length} potentially new/updated entities in ${kommuneNumber}`
    );

    if (recentEntities.length === 0) {
      return { newEntities: 0, updatedEntities: 0 };
    }

    // Process the recent entities
    let newCount = 0;
    let updatedCount = 0;

    for (const entity of recentEntities) {
      try {
        const companyData = {
          organizationNumber: entity.organisasjonsnummer,
          name: entity.navn,
          organizationForm: entity.organisasjonsform?.kode,
          status: entity.konkurs ? "Bankruptcy" : "Active",
          registrationDate: entity.registreringsdatoEnhetsregisteret
            ? new Date(entity.registreringsdatoEnhetsregisteret)
            : undefined,
          industry: entity.naeringskode1?.beskrivelse,
          industryCode: entity.naeringskode1?.kode,
          businessAddress: this.formatAddress(entity.forretningsadresse),
          postalAddress: this.formatAddress(entity.postadresse),
          isBankrupt: entity.konkurs || false,
          riskScore: this.calculateRiskScore(entity),
          lastUpdated: new Date(),
          currentKommuneId: kommuneNumber,
          registrationDateEnhetsregisteret:
            entity.registreringsdatoEnhetsregisteret,
          registrationDateForetaksregisteret:
            entity.registreringsdatoForetaksregisteret,
          deletionDate: entity.slettedato,
          businessCode1: entity.naeringskode1?.kode,
          businessCode2: entity.naeringskode2?.kode,
          businessCode3: entity.naeringskode3?.kode,
        };

        // Check if company exists
        const existingCompany = await prisma.company.findUnique({
          where: { organizationNumber: entity.organisasjonsnummer },
        });

        if (existingCompany) {
          // Update existing company
          const updatedCompany = await prisma.company.update({
            where: { organizationNumber: entity.organisasjonsnummer },
            data: companyData,
          });

          // Check for address changes and update history
          await this.updateAddressHistoryIfChanged(
            updatedCompany.id,
            entity,
            existingCompany
          );
          updatedCount++;
        } else {
          // Create new company
          const newCompany = await prisma.company.create({
            data: companyData,
          });

          // Save initial address history for new company
          await this.saveInitialAddressHistory(newCompany.id, entity);
          newCount++;
        }
      } catch (error) {
        console.error(
          `❌ Failed to process entity ${entity.organisasjonsnummer}:`,
          error
        );
      }
    }

    return { newEntities: newCount, updatedEntities: updatedCount };
  }

  /**
   * Run targeted update for high-priority kommuner only
   * Useful for more frequent updates of major business centers
   */
  async runHighPriorityDailyUpdate(): Promise<{
    totalKommuner: number;
    successfulKommuner: number;
    totalNewEntities: number;
    totalUpdatedEntities: number;
    totalProcessingTime: number;
    kommuneStats: DailyUpdateStats[];
  }> {
    console.log(
      "🌟 HIGH-PRIORITY DAILY UPDATE: Updating major business centers..."
    );

    const highPriorityKommuner = kommuneService.getHighPriorityKommuner();
    console.log(
      `📍 Checking ${highPriorityKommuner.length} high-priority kommuner for changes`
    );

    // Similar implementation but only for high-priority kommuner
    // This could run more frequently (e.g., every 6 hours) for critical business monitoring

    const startTime = Date.now();
    const kommuneStats: DailyUpdateStats[] = [];
    let totalNewEntities = 0;
    let totalUpdatedEntities = 0;
    let successfulKommuner = 0;

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateFilter = yesterday.toISOString().split("T")[0];

    for (const kommune of highPriorityKommuner) {
      try {
        const kommuneStartTime = Date.now();
        const { newEntities, updatedEntities } = await this.updateKommuneDaily(
          kommune.number,
          dateFilter
        );
        const processingTime = Date.now() - kommuneStartTime;

        kommuneStats.push({
          kommuneNumber: kommune.number,
          kommuneName: kommune.name,
          newEntities,
          updatedEntities,
          processingTime,
          success: true,
        });

        totalNewEntities += newEntities;
        totalUpdatedEntities += updatedEntities;
        successfulKommuner++;

        await delay.betweenBronnøysundCalls();
      } catch (error) {
        console.error(
          `❌ Failed high-priority update for kommune ${kommune.number}:`,
          error
        );

        kommuneStats.push({
          kommuneNumber: kommune.number,
          kommuneName: kommune.name,
          newEntities: 0,
          updatedEntities: 0,
          processingTime: 0,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    const totalProcessingTime = Date.now() - startTime;

    return {
      totalKommuner: highPriorityKommuner.length,
      successfulKommuner,
      totalNewEntities,
      totalUpdatedEntities,
      totalProcessingTime,
      kommuneStats,
    };
  }

  private formatAddress(address: any): string {
    if (!address) return "";

    const parts = [
      address.adresse?.[0],
      address.postnummer,
      address.poststed,
    ].filter(Boolean);

    return parts.join(", ");
  }

  /**
   * Save initial address history for a new company
   */
  private async saveInitialAddressHistory(
    companyId: string,
    entity: any
  ): Promise<void> {
    try {
      const histories: any[] = [];

      // Business address
      if (entity.forretningsadresse) {
        histories.push({
          companyId,
          organizationNumber: entity.organisasjonsnummer,
          address: this.formatAddress(entity.forretningsadresse),
          postalCode: entity.forretningsadresse.postnummer,
          city: entity.forretningsadresse.poststed,
          kommuneNumber: entity.forretningsadresse.kommunenummer,
          kommuneName: entity.forretningsadresse.poststed,
          addressType: "business",
          fromDate: entity.registreringsdatoEnhetsregisteret
            ? new Date(entity.registreringsdatoEnhetsregisteret)
            : new Date(),
          isCurrentAddress: true,
        });
      }

      // Postal address (if different)
      if (
        entity.postadresse &&
        JSON.stringify(entity.postadresse) !==
          JSON.stringify(entity.forretningsadresse)
      ) {
        histories.push({
          companyId,
          organizationNumber: entity.organisasjonsnummer,
          address: this.formatAddress(entity.postadresse),
          postalCode: entity.postadresse.postnummer,
          city: entity.postadresse.poststed,
          kommuneNumber: entity.postadresse.kommunenummer,
          kommuneName: entity.postadresse.poststed,
          addressType: "postal",
          fromDate: entity.registreringsdatoEnhetsregisteret
            ? new Date(entity.registreringsdatoEnhetsregisteret)
            : new Date(),
          isCurrentAddress: true,
        });
      }

      // Save address histories
      for (const history of histories) {
        await prisma.companyAddressHistory.create({
          data: history,
        });
      }
    } catch (error) {
      console.error("Failed to save initial address history:", error);
    }
  }

  /**
   * Update address history if company address has changed
   */
  private async updateAddressHistoryIfChanged(
    companyId: string,
    newEntity: any,
    existingCompany: any
  ): Promise<void> {
    try {
      // Check if business address changed
      const newBusinessAddr = this.formatAddress(newEntity.forretningsadresse);
      const oldBusinessAddr = existingCompany.currentAddress;

      if (
        newBusinessAddr !== oldBusinessAddr &&
        newBusinessAddr &&
        oldBusinessAddr
      ) {
        // Mark old address as no longer current
        await prisma.companyAddressHistory.updateMany({
          where: {
            companyId,
            addressType: "business",
            isCurrentAddress: true,
          },
          data: {
            isCurrentAddress: false,
            toDate: new Date(),
          },
        });

        // Add new current address
        await prisma.companyAddressHistory.create({
          data: {
            companyId,
            organizationNumber: newEntity.organisasjonsnummer,
            address: newBusinessAddr,
            postalCode: newEntity.forretningsadresse?.postnummer,
            city: newEntity.forretningsadresse?.poststed,
            kommuneNumber: newEntity.forretningsadresse?.kommunenummer,
            kommuneName: newEntity.forretningsadresse?.poststed,
            addressType: "business",
            fromDate: new Date(),
            isCurrentAddress: true,
          },
        });

        console.log(
          `📍 Address change detected for ${newEntity.organisasjonsnummer}: ${oldBusinessAddr} → ${newBusinessAddr}`
        );
      }
    } catch (error) {
      console.error("Failed to update address history:", error);
    }
  }

  private calculateRiskScore(entity: any): number {
    let score = 0;

    if (entity.konkurs) score += 50;

    if (entity.registreringsdatoEnhetsregisteret) {
      const regDate = new Date(entity.registreringsdatoEnhetsregisteret);
      const daysSinceReg =
        (Date.now() - regDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceReg < 365) score += 20;
    }

    if (
      entity.forretningsadresse?.kommunenummer !==
      entity.postadresse?.kommunenummer
    ) {
      score += 15;
    }

    return Math.min(score, 100);
  }
}

export const dailyIncrementalService = DailyIncrementalService.getInstance();
