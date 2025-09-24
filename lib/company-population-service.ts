/**
 * Company Population Service
 *
 * Populates the Company table with ALL Norwegian companies from Brønnøysundregistrene
 * Uses optimized batch operations for handling millions of records
 */

import { prisma } from "./database";
import {
  optimizedCompanyService,
  CompanyData,
} from "./optimized-company-service";
import { delay } from "./config/api-delays";

export interface PopulationProgress {
  totalCompanies: number;
  processedCompanies: number;
  savedCompanies: number;
  errorCount: number;
  currentPage: number;
  totalPages: number;
  startTime: Date;
  estimatedTimeRemaining?: string;
  status: "RUNNING" | "PAUSED" | "COMPLETED" | "ERROR";
  lastError?: string;
}

export interface PopulationOptions {
  startPage?: number;
  maxPages?: number;
  batchSize?: number;
  delayBetweenBatches?: number;
  skipExisting?: boolean;
  kommuneFilter?: string; // Optional: Only companies from specific kommune
}

export class CompanyPopulationService {
  private static instance: CompanyPopulationService;
  private progress: PopulationProgress | null = null;
  private shouldStop = false;

  public static getInstance(): CompanyPopulationService {
    if (!CompanyPopulationService.instance) {
      CompanyPopulationService.instance = new CompanyPopulationService();
    }
    return CompanyPopulationService.instance;
  }

  /**
   * Start populating the Company table with all Norwegian companies
   */
  async startPopulation(options: PopulationOptions = {}): Promise<void> {
    const {
      startPage = 0,
      maxPages = Infinity,
      batchSize = 100,
      delayBetweenBatches = 1000,
      skipExisting = true,
      kommuneFilter,
    } = options;

    console.log("🚀 Starting company population from Brønnøysundregistrene...");
    console.log(`📊 Options:`, {
      startPage,
      maxPages,
      batchSize,
      delayBetweenBatches,
      skipExisting,
      kommuneFilter,
    });

    this.shouldStop = false;
    this.progress = {
      totalCompanies: 0,
      processedCompanies: 0,
      savedCompanies: 0,
      errorCount: 0,
      currentPage: startPage,
      totalPages: 0,
      startTime: new Date(),
      status: "RUNNING",
    };

    try {
      // First, get total count to estimate progress
      const firstPageUrl = this.buildApiUrl(0, 1, kommuneFilter);
      const firstPageResponse = await fetch(firstPageUrl);
      const firstPageData = await firstPageResponse.json();

      this.progress.totalCompanies = firstPageData.page?.totalElements || 0;
      this.progress.totalPages = Math.ceil(
        this.progress.totalCompanies / batchSize
      );

      console.log(
        `📈 Total companies to process: ${this.progress.totalCompanies.toLocaleString()}`
      );
      console.log(
        `📄 Total pages: ${this.progress.totalPages.toLocaleString()}`
      );

      // Process pages
      let currentPage = startPage;
      const endPage = Math.min(startPage + maxPages, this.progress.totalPages);

      while (currentPage < endPage && !this.shouldStop) {
        try {
          console.log(
            `\n📄 Processing page ${currentPage + 1}/${endPage} (${((currentPage / endPage) * 100).toFixed(1)}%)`
          );

          const pageResult = await this.processPage(
            currentPage,
            batchSize,
            kommuneFilter,
            skipExisting
          );

          this.progress.currentPage = currentPage;
          this.progress.processedCompanies += pageResult.processed;
          this.progress.savedCompanies += pageResult.saved;
          this.progress.errorCount += pageResult.errors;

          // Update time estimation
          const elapsed = Date.now() - this.progress.startTime.getTime();
          const avgTimePerPage = elapsed / (currentPage - startPage + 1);
          const remainingPages = endPage - currentPage - 1;
          const estimatedRemainingMs = avgTimePerPage * remainingPages;
          this.progress.estimatedTimeRemaining =
            this.formatDuration(estimatedRemainingMs);

          console.log(
            `✅ Page ${currentPage + 1} complete: ${pageResult.saved}/${pageResult.processed} companies saved`
          );
          console.log(
            `📊 Total progress: ${this.progress.savedCompanies.toLocaleString()}/${this.progress.totalCompanies.toLocaleString()} companies`
          );
          console.log(
            `⏱️ Estimated time remaining: ${this.progress.estimatedTimeRemaining}`
          );

          currentPage++;

          // Delay between batches to avoid overwhelming the API
          if (delayBetweenBatches > 0 && currentPage < endPage) {
            await delay(delayBetweenBatches);
          }
        } catch (error) {
          console.error(`❌ Error processing page ${currentPage}:`, error);
          this.progress.errorCount++;
          this.progress.lastError =
            error instanceof Error ? error.message : "Unknown error";

          // Continue with next page after error
          currentPage++;
        }
      }

      this.progress.status = this.shouldStop ? "PAUSED" : "COMPLETED";
      const totalTime = Date.now() - this.progress.startTime.getTime();

      console.log(`\n🎉 Population ${this.progress.status.toLowerCase()}!`);
      console.log(`📊 Final stats:`);
      console.log(
        `   - Total processed: ${this.progress.processedCompanies.toLocaleString()}`
      );
      console.log(
        `   - Successfully saved: ${this.progress.savedCompanies.toLocaleString()}`
      );
      console.log(`   - Errors: ${this.progress.errorCount}`);
      console.log(`   - Total time: ${this.formatDuration(totalTime)}`);
      console.log(
        `   - Average: ${Math.round(this.progress.processedCompanies / (totalTime / 1000))} companies/second`
      );
    } catch (error) {
      console.error("💥 Population failed:", error);
      if (this.progress) {
        this.progress.status = "ERROR";
        this.progress.lastError =
          error instanceof Error ? error.message : "Unknown error";
      }
      throw error;
    }
  }

  /**
   * Process a single page of companies
   */
  private async processPage(
    page: number,
    size: number,
    kommuneFilter?: string,
    skipExisting = true
  ): Promise<{ processed: number; saved: number; errors: number }> {
    const url = this.buildApiUrl(page, size, kommuneFilter);

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(
          `API request failed: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      const companies = data._embedded?.enheter || [];

      if (companies.length === 0) {
        return { processed: 0, saved: 0, errors: 0 };
      }

      // Convert API data to our format
      const companyData: CompanyData[] = companies.map((enhet: any) => ({
        organizationNumber: enhet.organisasjonsnummer,
        name: enhet.navn,
        organizationForm: enhet.organisasjonsform?.kode,
        status: enhet.konkurs ? "Bankruptcy" : "Active",
        registrationDate: enhet.registreringsdatoEnhetsregisteret
          ? new Date(enhet.registreringsdatoEnhetsregisteret)
          : undefined,
        industry: enhet.naeringskode1?.beskrivelse,
        industryCode: enhet.naeringskode1?.kode,
        businessAddress: enhet.forretningsadresse,
        postalAddress: enhet.postadresse,
        isBankrupt: enhet.konkurs || false,
        riskScore: this.calculateInitialRiskScore(enhet),
      }));

      // Filter out existing companies if requested
      let companiesToSave = companyData;
      if (skipExisting) {
        const existingOrgNumbers = await prisma.company.findMany({
          where: {
            organizationNumber: {
              in: companyData.map((c) => c.organizationNumber),
            },
          },
          select: { organizationNumber: true },
        });

        const existingSet = new Set(
          existingOrgNumbers.map((c) => c.organizationNumber)
        );
        companiesToSave = companyData.filter(
          (c) => !existingSet.has(c.organizationNumber)
        );

        console.log(
          `📋 Filtered out ${companyData.length - companiesToSave.length} existing companies`
        );
      }

      if (companiesToSave.length === 0) {
        return { processed: companies.length, saved: 0, errors: 0 };
      }

      // Use optimized batch save
      const result = await optimizedCompanyService.batchSaveCompanies(
        companiesToSave,
        kommuneFilter || "0000" // Default kommune for national import
      );

      return {
        processed: companies.length,
        saved: result.newCompanies + result.updatedCompanies,
        errors: result.errors.length,
      };
    } catch (error) {
      console.error(`Error processing page ${page}:`, error);
      return { processed: 0, saved: 0, errors: 1 };
    }
  }

  /**
   * Build API URL for Brønnøysundregistrene
   */
  private buildApiUrl(
    page: number,
    size: number,
    kommuneFilter?: string
  ): string {
    const baseUrl = "https://data.brreg.no/enhetsregisteret/api/enheter";
    const params = new URLSearchParams({
      page: page.toString(),
      size: size.toString(),
      sort: "organisasjonsnummer,asc",
    });

    if (kommuneFilter) {
      params.append("kommunenummer", kommuneFilter);
    }

    return `${baseUrl}?${params.toString()}`;
  }

  /**
   * Calculate initial risk score based on company data
   */
  private calculateInitialRiskScore(enhet: any): number {
    let score = 0;

    // Bankruptcy risk
    if (enhet.konkurs) score += 50;

    // Recent registration (shell company risk)
    if (enhet.registreringsdatoEnhetsregisteret) {
      const regDate = new Date(enhet.registreringsdatoEnhetsregisteret);
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      if (regDate > oneYearAgo) score += 10;
    }

    // High-risk industries
    const highRiskIndustries = ["68.100", "70.220", "55.100"]; // Real estate, consulting, hotels
    if (
      enhet.naeringskode1?.kode &&
      highRiskIndustries.includes(enhet.naeringskode1.kode)
    ) {
      score += 15;
    }

    // Address mismatch
    if (
      enhet.forretningsadresse?.kommunenummer !==
      enhet.postadresse?.kommunenummer
    ) {
      score += 10;
    }

    return Math.min(score, 100); // Cap at 100
  }

  /**
   * Get current population progress
   */
  getProgress(): PopulationProgress | null {
    return this.progress;
  }

  /**
   * Stop the population process
   */
  stop(): void {
    console.log("🛑 Stopping population process...");
    this.shouldStop = true;
  }

  /**
   * Format duration in human-readable format
   */
  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
    if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }
}

// Export singleton instance
export const companyPopulationService = CompanyPopulationService.getInstance();
