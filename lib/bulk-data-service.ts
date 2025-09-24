/**
 * Bulk Data Service - Optimized approach using Brønnøysundregistrene bulk downloads
 *
 * Based on official API documentation:
 * https://data.brreg.no/enhetsregisteret/api/dokumentasjon/no/index.html
 */

import { prisma } from "./database";
import { delay } from "./config/api-delays";
import { createGunzip } from "zlib";
import { pipeline } from "stream/promises";

interface BulkDataOptions {
  format: "json" | "csv" | "xlsx";
  includeSubEntities?: boolean;
  includeRoles?: boolean;
}

export class BulkDataService {
  private static instance: BulkDataService;

  static getInstance(): BulkDataService {
    if (!BulkDataService.instance) {
      BulkDataService.instance = new BulkDataService();
    }
    return BulkDataService.instance;
  }

  /**
   * Download complete dataset instead of paginating
   * Much more efficient according to Brønnøysundregistrene documentation
   */
  async downloadCompleteDataset(
    options: BulkDataOptions = { format: "json" }
  ): Promise<{
    totalEntities: number;
    processedEntities: number;
    errors: number;
    downloadTime: number;
    processingTime: number;
  }> {
    console.log("🚀 BULK DOWNLOAD: Starting complete dataset download...");
    const startTime = Date.now();

    try {
      // Main entities bulk download - using optimized pagination (10,000 per page)
      console.log(
        "🚀 Using optimized pagination approach (10,000 entities per page)"
      );
      const entitiesResponse = await this.downloadAllEntitiesOptimized();

      let subEntitiesResponse = null;
      let rolesResponse = null;

      // Optional: Download sub-entities
      if (options.includeSubEntities) {
        console.log(
          "📋 Downloading sub-entities using optimized pagination..."
        );
        subEntitiesResponse = await this.downloadAllSubEntitiesOptimized();
      }

      // Optional: Download roles - Note: roles may not have bulk download, we'll need individual calls
      if (options.includeRoles) {
        console.log(
          "⚠️ Roles data requires individual API calls per company - this will be processed after entities"
        );
        // We'll process roles after we have the entities data
      }

      const downloadTime = Date.now() - startTime;
      console.log(`✅ BULK DOWNLOAD completed in ${downloadTime}ms`);

      // Process the downloaded data
      const processingStartTime = Date.now();
      const processedEntities = await this.processBulkData(entitiesResponse);
      const processingTime = Date.now() - processingStartTime;

      return {
        totalEntities: entitiesResponse?.length || 0,
        processedEntities,
        errors: 0, // TODO: Implement error tracking
        downloadTime,
        processingTime,
      };
    } catch (error) {
      console.error("❌ BULK DOWNLOAD failed:", error);
      throw error;
    }
  }

  /**
   * Download all entities using optimized pagination (10,000 per page)
   */
  private async downloadAllEntitiesOptimized(): Promise<any[]> {
    console.log("📥 Starting optimized entities download...");

    // First, get the total count
    const firstPageResponse = await fetch(
      "https://data.brreg.no/enhetsregisteret/api/enheter?size=1&page=0",
      {
        headers: {
          Accept: "application/json",
          "User-Agent": "konkurser-i-norge-bulk-downloader/1.0",
        },
      }
    );

    if (!firstPageResponse.ok) {
      throw new Error(
        `Failed to get entity count: ${firstPageResponse.status}`
      );
    }

    const firstPageData = await firstPageResponse.json();
    const totalElements = firstPageData.page.totalElements;
    const pageSize = 5000; // API limit: size * (page+1) <= 10,000
    const maxAccessibleResults = 10000; // API limitation
    const actuallyAccessible = Math.min(totalElements, maxAccessibleResults);
    const totalPages = Math.ceil(actuallyAccessible / pageSize);

    console.log(
      `📊 Total entities in registry: ${totalElements.toLocaleString()}`
    );
    console.log(
      `⚠️ API limitation: Can only access first ${maxAccessibleResults.toLocaleString()} results`
    );
    console.log(
      `📄 Pages needed: ${totalPages} (${pageSize} entities per page)`
    );

    const allEntities: any[] = [];

    // Download all pages
    for (let page = 0; page < totalPages; page++) {
      console.log(
        `📄 Downloading page ${page + 1}/${totalPages} (${((page / totalPages) * 100).toFixed(1)}%)`
      );

      const response = await fetch(
        `https://data.brreg.no/enhetsregisteret/api/enheter?size=${pageSize}&page=${page}`,
        {
          headers: {
            Accept: "application/json",
            "User-Agent": "konkurser-i-norge-bulk-downloader/1.0",
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to download page ${page}: ${response.status}`);
      }

      const pageData = await response.json();
      const entities = pageData._embedded?.enheter || [];
      allEntities.push(...entities);

      console.log(
        `✅ Page ${page + 1}: ${entities.length} entities (Total: ${allEntities.length.toLocaleString()})`
      );

      // Rate limiting between pages (be respectful to the API)
      if (page < totalPages - 1) {
        await delay.betweenBronnøysundCalls();
      }
    }

    console.log(
      `🎉 Successfully downloaded ${allEntities.length.toLocaleString()} entities!`
    );
    return allEntities;
  }

  /**
   * Download all sub-entities using optimized pagination
   */
  private async downloadAllSubEntitiesOptimized(): Promise<any[]> {
    console.log("📥 Starting optimized sub-entities download...");

    // Get total count for sub-entities
    const firstPageResponse = await fetch(
      "https://data.brreg.no/enhetsregisteret/api/underenheter?size=1&page=0",
      {
        headers: {
          Accept: "application/json",
          "User-Agent": "konkurser-i-norge-bulk-downloader/1.0",
        },
      }
    );

    if (!firstPageResponse.ok) {
      throw new Error(
        `Failed to get sub-entity count: ${firstPageResponse.status}`
      );
    }

    const firstPageData = await firstPageResponse.json();
    const totalElements = firstPageData.page.totalElements;
    const pageSize = 10000;
    const totalPages = Math.ceil(totalElements / pageSize);

    console.log(
      `📊 Total sub-entities: ${totalElements.toLocaleString()}, Pages needed: ${totalPages}`
    );

    const allSubEntities: any[] = [];

    for (let page = 0; page < totalPages; page++) {
      console.log(`📄 Downloading sub-entities page ${page + 1}/${totalPages}`);

      const response = await fetch(
        `https://data.brreg.no/enhetsregisteret/api/underenheter?size=${pageSize}&page=${page}`,
        {
          headers: {
            Accept: "application/json",
            "User-Agent": "konkurser-i-norge-bulk-downloader/1.0",
          },
        }
      );

      if (!response.ok) {
        throw new Error(
          `Failed to download sub-entities page ${page}: ${response.status}`
        );
      }

      const pageData = await response.json();
      const subEntities = pageData._embedded?.underenheter || [];
      allSubEntities.push(...subEntities);

      // Rate limiting
      if (page < totalPages - 1) {
        await delay.betweenBronnøysundCalls();
      }
    }

    console.log(
      `🎉 Successfully downloaded ${allSubEntities.length.toLocaleString()} sub-entities!`
    );
    return allSubEntities;
  }

  /**
   * Download bulk data from a specific endpoint
   */
  private async downloadBulkData(
    url: string,
    type: string,
    format: "json" | "csv" | "xlsx" = "json"
  ): Promise<any[]> {
    console.log(`📥 Downloading bulk ${type} data (${format} format)...`);

    const headers: Record<string, string> = {
      "User-Agent": "konkurser-i-norge-bulk-downloader/1.0",
    };

    // Set appropriate Accept header based on format
    if (format === "json") {
      headers.Accept = "application/json";
    } else if (format === "csv") {
      headers.Accept = "text/csv";
    } else if (format === "xlsx") {
      headers.Accept =
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    }

    const response = await fetch(url, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      throw new Error(
        `Failed to download ${type}: ${response.status} ${response.statusText}`
      );
    }

    let data: any[];

    if (format === "json") {
      // The API returns gzipped JSON data
      const contentType = response.headers.get("content-type");
      console.log(`📦 Content-Type: ${contentType}`);

      if (contentType?.includes("gzip")) {
        console.log("🗜️ Decompressing gzipped data...");
        // Handle gzipped response
        const buffer = await response.arrayBuffer();
        const decompressed = await this.decompressGzip(buffer);
        const jsonData = JSON.parse(decompressed);
        data = Array.isArray(jsonData)
          ? jsonData
          : jsonData._embedded?.enheter ||
            jsonData._embedded?.underenheter ||
            [];
      } else {
        // Handle regular JSON response
        const jsonData = await response.json();
        data = Array.isArray(jsonData)
          ? jsonData
          : jsonData._embedded?.enheter ||
            jsonData._embedded?.underenheter ||
            [];
      }
    } else {
      // For CSV/XLSX, we'd need different parsing logic
      // For now, return empty array and log that we got the data
      const textData = await response.text();
      console.log(
        `📄 Downloaded ${format.toUpperCase()} data (${textData.length} characters)`
      );
      data = []; // TODO: Parse CSV/XLSX data
    }

    console.log(`✅ Downloaded ${data.length} ${type} records`);
    return data;
  }

  /**
   * Process bulk data efficiently using batch operations
   */
  private async processBulkData(entities: any[]): Promise<number> {
    console.log(`🔄 Processing ${entities.length} entities...`);

    const batchSize = 1000;
    let processedCount = 0;

    for (let i = 0; i < entities.length; i += batchSize) {
      const batch = entities.slice(i, i + batchSize);

      try {
        await this.processBatch(batch);
        processedCount += batch.length;

        console.log(
          `📊 Processed ${processedCount}/${entities.length} entities (${((processedCount / entities.length) * 100).toFixed(1)}%)`
        );

        // Rate limiting between batches
        await delay.betweenBronnøysundCalls();
      } catch (error) {
        console.error(
          `❌ Batch processing failed for batch starting at ${i}:`,
          error
        );
        // Continue with next batch
      }
    }

    return processedCount;
  }

  /**
   * Process a batch of entities using database transactions
   */
  private async processBatch(entities: any[]): Promise<void> {
    const companyData = entities.map((entity) => ({
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
      // Map kommune information
      currentKommuneId:
        entity.forretningsadresse?.kommunenummer ||
        entity.postadresse?.kommunenummer,
      // Additional fields from bulk data
      registrationDateEnhetsregisteret:
        entity.registreringsdatoEnhetsregisteret,
      registrationDateForetaksregisteret:
        entity.registreringsdatoForetaksregisteret,
      deletionDate: entity.slettedato,
      businessCode1: entity.naeringskode1?.kode,
      businessCode2: entity.naeringskode2?.kode,
      businessCode3: entity.naeringskode3?.kode,
    }));

    // Use upsert for efficient bulk operations
    await prisma.$transaction(
      companyData.map((company) =>
        prisma.company.upsert({
          where: { organizationNumber: company.organizationNumber },
          update: company,
          create: company,
        })
      )
    );
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

  private calculateRiskScore(entity: any): number {
    let score = 0;

    // Bankruptcy increases risk
    if (entity.konkurs) score += 50;

    // Recent registration might indicate shell company
    if (entity.registreringsdatoEnhetsregisteret) {
      const regDate = new Date(entity.registreringsdatoEnhetsregisteret);
      const daysSinceReg =
        (Date.now() - regDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceReg < 365) score += 20; // Less than 1 year old
    }

    // Address mismatches
    if (
      entity.forretningsadresse?.kommunenummer !==
      entity.postadresse?.kommunenummer
    ) {
      score += 15;
    }

    return Math.min(score, 100);
  }

  /**
   * Decompress gzipped data from API response
   */
  private async decompressGzip(buffer: ArrayBuffer): Promise<string> {
    return new Promise((resolve, reject) => {
      const gunzip = createGunzip();
      const chunks: Buffer[] = [];

      gunzip.on("data", (chunk) => {
        chunks.push(chunk);
      });

      gunzip.on("end", () => {
        const decompressed = Buffer.concat(chunks).toString("utf-8");
        resolve(decompressed);
      });

      gunzip.on("error", (error) => {
        reject(error);
      });

      gunzip.write(Buffer.from(buffer));
      gunzip.end();
    });
  }

  /**
   * Get download progress/status
   */
  async getDownloadStatus(): Promise<{
    lastDownload: Date | null;
    totalEntities: number;
    isDownloading: boolean;
  }> {
    // TODO: Implement status tracking
    const totalEntities = await prisma.company.count();

    return {
      lastDownload: null, // TODO: Track last download time
      totalEntities,
      isDownloading: false, // TODO: Track active downloads
    };
  }
}

export const bulkDataService = BulkDataService.getInstance();
