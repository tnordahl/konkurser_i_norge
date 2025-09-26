/**
 * Postal Code Service
 *
 * Collects and manages postal codes for each kommune to enable
 * accurate address change detection and data validation
 */

import { prisma } from "./database";
import { delay } from "./config/api-delays";

export interface PostalCodeInfo {
  postalCode: string;
  city: string;
  kommuneNumber: string;
  kommuneName: string;
}

export class PostalCodeService {
  private static instance: PostalCodeService;

  static getInstance(): PostalCodeService {
    if (!PostalCodeService.instance) {
      PostalCodeService.instance = new PostalCodeService();
    }
    return PostalCodeService.instance;
  }

  /**
   * Collect postal codes for a specific kommune by analyzing existing company data
   */
  async collectPostalCodesForKommune(
    kommuneNumber: string
  ): Promise<PostalCodeInfo[]> {
    const startTime = Date.now();
    console.log(
      `📮 [${new Date().toISOString()}] Collecting postal codes for kommune ${kommuneNumber}...`
    );

    try {
      // First, try to get postal codes from existing company data
      const existingStartTime = Date.now();
      const existingCodes =
        await this.getPostalCodesFromCompanies(kommuneNumber);
      const existingTime = Date.now() - existingStartTime;
      console.log(
        `  └─ Found ${existingCodes.length} codes from existing companies (${existingTime}ms)`
      );

      // Then, try to get additional codes from the API
      const apiStartTime = Date.now();
      const apiCodes = await this.getPostalCodesFromAPI(kommuneNumber);
      const apiTime = Date.now() - apiStartTime;
      console.log(
        `  └─ Found ${apiCodes.length} codes from API (${apiTime}ms)`
      );

      // Merge and deduplicate
      const mergeStartTime = Date.now();
      const allCodes = this.mergePostalCodes(existingCodes, apiCodes);
      const mergeTime = Date.now() - mergeStartTime;
      console.log(
        `  └─ Merged to ${allCodes.length} unique postal codes (${mergeTime}ms)`
      );

      // Store in database
      const storeStartTime = Date.now();
      await this.storePostalCodes(kommuneNumber, allCodes);
      const storeTime = Date.now() - storeStartTime;

      const totalTime = Date.now() - startTime;
      console.log(
        `📊 [${new Date().toISOString()}] Postal code collection complete for kommune ${kommuneNumber}:`
      );
      console.log(`  ├─ Unique postal codes: ${allCodes.length}`);
      console.log(`  ├─ Storage time: ${storeTime}ms`);
      console.log(`  └─ Total time: ${totalTime}ms`);

      return allCodes;
    } catch (error) {
      const totalTime = Date.now() - startTime;
      console.error(
        `❌ [${new Date().toISOString()}] Failed to collect postal codes for kommune ${kommuneNumber} (after ${totalTime}ms):`,
        error
      );
      return [];
    }
  }

  /**
   * Get postal codes from existing company data in the database
   */
  private async getPostalCodesFromCompanies(
    kommuneNumber: string
  ): Promise<PostalCodeInfo[]> {
    console.log(
      `🔍 Searching existing companies for postal codes in kommune ${kommuneNumber}...`
    );

    const companies = await prisma.company.findMany({
      where: {
        OR: [
          {
            businessAddress: { path: ["kommunenummer"], equals: kommuneNumber },
          },
          { postalAddress: { path: ["kommunenummer"], equals: kommuneNumber } },
        ],
      },
      select: {
        currentPostalCode: true,
        currentCity: true,
        businessAddress: true,
        postalAddress: true,
      },
    });

    const postalCodes: PostalCodeInfo[] = [];

    for (const company of companies) {
      // Extract from current data
      if (company.currentPostalCode && company.currentCity) {
        postalCodes.push({
          postalCode: company.currentPostalCode,
          city: company.currentCity,
          kommuneNumber,
          kommuneName: company.currentCity, // We'll get the proper name later
        });
      }

      // Extract from business address JSON
      if (
        company.businessAddress &&
        typeof company.businessAddress === "object"
      ) {
        const addr = company.businessAddress as any;
        if (
          addr.postnummer &&
          addr.poststed &&
          addr.kommunenummer === kommuneNumber
        ) {
          postalCodes.push({
            postalCode: addr.postnummer,
            city: addr.poststed,
            kommuneNumber,
            kommuneName: addr.poststed,
          });
        }
      }

      // Extract from postal address JSON
      if (company.postalAddress && typeof company.postalAddress === "object") {
        const addr = company.postalAddress as any;
        if (
          addr.postnummer &&
          addr.poststed &&
          addr.kommunenummer === kommuneNumber
        ) {
          postalCodes.push({
            postalCode: addr.postnummer,
            city: addr.poststed,
            kommuneNumber,
            kommuneName: addr.poststed,
          });
        }
      }
    }

    console.log(
      `📊 Found ${postalCodes.length} postal codes from existing company data`
    );
    return postalCodes;
  }

  /**
   * Get postal codes by querying the API for companies in this kommune
   */
  private async getPostalCodesFromAPI(
    kommuneNumber: string
  ): Promise<PostalCodeInfo[]> {
    console.log(
      `🌐 Fetching postal codes from API for kommune ${kommuneNumber}...`
    );

    try {
      const url = `https://data.brreg.no/enhetsregisteret/api/enheter?kommunenummer=${kommuneNumber}&size=1000&page=0`;

      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "konkurser-i-norge-postal-codes/1.0",
        },
      });

      if (!response.ok) {
        console.warn(
          `⚠️ API request failed for kommune ${kommuneNumber}: ${response.status}`
        );
        return [];
      }

      const data = await response.json();
      const entities = data._embedded?.enheter || [];

      const postalCodes: PostalCodeInfo[] = [];

      for (const entity of entities) {
        // Business address
        if (
          entity.forretningsadresse?.postnummer &&
          entity.forretningsadresse?.poststed
        ) {
          postalCodes.push({
            postalCode: entity.forretningsadresse.postnummer,
            city: entity.forretningsadresse.poststed,
            kommuneNumber,
            kommuneName: entity.forretningsadresse.poststed,
          });
        }

        // Postal address
        if (entity.postadresse?.postnummer && entity.postadresse?.poststed) {
          postalCodes.push({
            postalCode: entity.postadresse.postnummer,
            city: entity.postadresse.poststed,
            kommuneNumber,
            kommuneName: entity.postadresse.poststed,
          });
        }
      }

      console.log(`📊 Found ${postalCodes.length} postal codes from API`);
      return postalCodes;
    } catch (error) {
      console.error(
        `❌ Failed to fetch postal codes from API for kommune ${kommuneNumber}:`,
        error
      );
      return [];
    }
  }

  /**
   * Merge and deduplicate postal codes from different sources
   */
  private mergePostalCodes(
    existing: PostalCodeInfo[],
    api: PostalCodeInfo[]
  ): PostalCodeInfo[] {
    const merged = [...existing, ...api];
    const unique = new Map<string, PostalCodeInfo>();

    for (const code of merged) {
      const key = `${code.postalCode}-${code.kommuneNumber}`;
      if (!unique.has(key)) {
        unique.set(key, code);
      }
    }

    return Array.from(unique.values()).sort((a, b) =>
      a.postalCode.localeCompare(b.postalCode)
    );
  }

  /**
   * Store postal codes in the database
   */
  private async storePostalCodes(
    kommuneNumber: string,
    postalCodes: PostalCodeInfo[]
  ): Promise<void> {
    console.log(
      `💾 Storing ${postalCodes.length} postal codes for kommune ${kommuneNumber}...`
    );

    try {
      // First, ensure the kommune exists
      const kommune = await prisma.kommune.upsert({
        where: { kommuneNumber },
        update: {},
        create: {
          kommuneNumber,
          name: postalCodes[0]?.kommuneName || `Kommune ${kommuneNumber}`,
          county: "Unknown", // We'll update this later
        },
      });

      // Store postal codes
      for (const postalCode of postalCodes) {
        await prisma.kommunePostalCode.upsert({
          where: {
            kommuneNumber_postalCode: {
              kommuneNumber,
              postalCode: postalCode.postalCode,
            },
          },
          update: {
            city: postalCode.city,
            isActive: true,
          },
          create: {
            kommuneId: kommune.id,
            kommuneNumber,
            postalCode: postalCode.postalCode,
            city: postalCode.city,
            isActive: true,
          },
        });
      }

      console.log(
        `✅ Successfully stored postal codes for kommune ${kommuneNumber}`
      );
    } catch (error) {
      console.error(
        `❌ Failed to store postal codes for kommune ${kommuneNumber}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Get all postal codes for a kommune
   */
  async getPostalCodesForKommune(
    kommuneNumber: string
  ): Promise<PostalCodeInfo[]> {
    const postalCodes = await prisma.kommunePostalCode.findMany({
      where: {
        kommuneNumber,
        isActive: true,
      },
      orderBy: {
        postalCode: "asc",
      },
    });

    return postalCodes.map((pc) => ({
      postalCode: pc.postalCode,
      city: pc.city,
      kommuneNumber: pc.kommuneNumber,
      kommuneName: pc.city, // Using city as kommune name for now
    }));
  }

  /**
   * Check if a postal code belongs to a specific kommune
   */
  async isPostalCodeInKommune(
    postalCode: string,
    kommuneNumber: string
  ): Promise<boolean> {
    const count = await prisma.kommunePostalCode.count({
      where: {
        postalCode,
        kommuneNumber,
        isActive: true,
      },
    });

    return count > 0;
  }

  /**
   * Find which kommune a postal code belongs to
   */
  async findKommuneForPostalCode(postalCode: string): Promise<string | null> {
    const result = await prisma.kommunePostalCode.findFirst({
      where: {
        postalCode,
        isActive: true,
      },
      select: {
        kommuneNumber: true,
      },
    });

    return result?.kommuneNumber || null;
  }

  /**
   * Collect postal codes for all kommuner
   */
  async collectAllPostalCodes(): Promise<void> {
    console.log("🚀 Starting postal code collection for all kommuner...");

    // Get all unique kommune numbers from existing companies
    const kommuneNumbers = await prisma.company
      .findMany({
        select: {
          businessAddress: true,
          postalAddress: true,
        },
      })
      .then((companies) => {
        const numbers = new Set<string>();

        for (const company of companies) {
          if (
            company.businessAddress &&
            typeof company.businessAddress === "object"
          ) {
            const addr = company.businessAddress as any;
            if (addr.kommunenummer) numbers.add(addr.kommunenummer);
          }

          if (
            company.postalAddress &&
            typeof company.postalAddress === "object"
          ) {
            const addr = company.postalAddress as any;
            if (addr.kommunenummer) numbers.add(addr.kommunenummer);
          }
        }

        return Array.from(numbers);
      });

    console.log(`📊 Found ${kommuneNumbers.length} unique kommuner to process`);

    for (const [index, kommuneNumber] of Array.from(kommuneNumbers.entries())) {
      console.log(
        `📮 Processing kommune ${index + 1}/${kommuneNumbers.length}: ${kommuneNumber}`
      );

      try {
        await this.collectPostalCodesForKommune(kommuneNumber);

        // Rate limiting
        if (index < kommuneNumbers.length - 1) {
          await delay.betweenBronnøysundCalls();
        }
      } catch (error) {
        console.error(`❌ Failed to process kommune ${kommuneNumber}:`, error);
        continue;
      }
    }

    console.log("🎉 Postal code collection complete!");
  }

  /**
   * Get statistics about postal code coverage
   */
  async getPostalCodeStats(): Promise<{
    totalKommuner: number;
    kommunerWithPostalCodes: number;
    totalPostalCodes: number;
    averagePostalCodesPerKommune: number;
  }> {
    const totalKommuner = await prisma.kommune.count();
    const kommunerWithPostalCodes = await prisma.kommune.count({
      where: {
        postalCodes: {
          some: {
            isActive: true,
          },
        },
      },
    });
    const totalPostalCodes = await prisma.kommunePostalCode.count({
      where: { isActive: true },
    });

    return {
      totalKommuner,
      kommunerWithPostalCodes,
      totalPostalCodes,
      averagePostalCodesPerKommune:
        kommunerWithPostalCodes > 0
          ? Math.round((totalPostalCodes / kommunerWithPostalCodes) * 100) / 100
          : 0,
    };
  }
}

export const postalCodeService = PostalCodeService.getInstance();
