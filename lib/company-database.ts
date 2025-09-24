/**
 * Company Database with Smart Caching
 *
 * This system maintains a comprehensive database of all Norwegian companies
 * with intelligent SWR-based caching that updates every 12 hours.
 */

import { prisma } from "./database";
import {
  RISK_THRESHOLDS,
  RISK_FACTORS,
  HIGH_RISK_INDUSTRIES,
  getRiskLevel,
} from "@/lib/config/risk-thresholds";
import { delay, BATCH_CONFIG } from "@/lib/config/api-delays";
import { dateUtils } from "@/lib/config/date-utils";

export interface CompanyRecord {
  organizationNumber: string;
  name: string;
  businessAddress: {
    address: string[];
    postalCode: string;
    city: string;
    kommuneNumber: string;
    kommuneName: string;
  };
  postalAddress?: {
    address: string[];
    postalCode: string;
    city: string;
    kommuneNumber: string;
    kommuneName: string;
  };
  industry: {
    code: string;
    description: string;
  };
  organizationForm: {
    code: string;
    description: string;
  };
  registrationDate: string;
  lastUpdated: Date;
  keyPersons: PersonRole[];
  riskScore: number;
  tags: string[]; // e.g., ["MOVED_FROM_RISOR", "HIGH_RISK_INDUSTRY"]
}

export interface PersonRole {
  name: string;
  birthYear?: string;
  roles: string[]; // e.g., ["CEO", "BOARD_MEMBER", "OWNER"]
  startDate?: string;
  endDate?: string;
}

export interface AddressHistory {
  organizationNumber: string;
  previousAddress: {
    address: string[];
    postalCode: string;
    city: string;
    kommuneNumber: string;
  };
  currentAddress: {
    address: string[];
    postalCode: string;
    city: string;
    kommuneNumber: string;
  };
  changeDate: Date;
  detectionMethod: string;
}

/**
 * Smart Company Data Manager with 12-hour caching
 */
export class CompanyDataManager {
  private static instance: CompanyDataManager;
  private cacheValidityHours = 12;

  public static getInstance(): CompanyDataManager {
    if (!CompanyDataManager.instance) {
      CompanyDataManager.instance = new CompanyDataManager();
    }
    return CompanyDataManager.instance;
  }

  /**
   * Get company data with smart caching
   */
  async getCompany(organizationNumber: string): Promise<CompanyRecord | null> {
    try {
      // Check if we have recent cached data
      const cached = await this.getCachedCompany(organizationNumber);
      if (cached && this.isCacheValid(cached.lastUpdated)) {
        console.log(`📦 Using cached data for ${organizationNumber}`);
        return cached;
      }

      // Fetch fresh data if cache is stale
      console.log(`🔄 Fetching fresh data for ${organizationNumber}`);
      const fresh = await this.fetchAndCacheCompany(organizationNumber);
      return fresh;
    } catch (error) {
      console.error(`Failed to get company ${organizationNumber}:`, error);
      return null;
    }
  }

  /**
   * Get multiple companies with batch processing
   */
  async getCompanies(organizationNumbers: string[]): Promise<CompanyRecord[]> {
    const results: CompanyRecord[] = [];
    const batchSize = BATCH_CONFIG.COMPANY_BATCH_SIZE; // Process in batches to avoid overwhelming API

    for (let i = 0; i < organizationNumbers.length; i += batchSize) {
      const batch = organizationNumbers.slice(i, i + batchSize);
      const batchPromises = batch.map((orgNr) => this.getCompany(orgNr));
      const batchResults = await Promise.all(batchPromises);

      results.push(
        ...(batchResults.filter((r) => r !== null) as CompanyRecord[])
      );

      // Rate limiting between batches using standardized delay
      if (i + batchSize < organizationNumbers.length) {
        await delay.betweenApiBatches();
      }
    }

    return results;
  }

  /**
   * Search companies by criteria with caching
   */
  async searchCompanies(criteria: {
    kommuneNumber?: string;
    industryCode?: string;
    name?: string;
    postalCode?: string;
    tags?: string[];
    riskScoreMin?: number;
  }): Promise<CompanyRecord[]> {
    try {
      // First check our database
      const dbResults = await this.searchCachedCompanies(criteria);

      // If we have recent comprehensive data for this search, return it
      if (dbResults.length > 0 && this.hasRecentSearchData(criteria)) {
        console.log(`📦 Using cached search results for criteria:`, criteria);
        return dbResults;
      }

      // Otherwise, fetch fresh data from external API
      console.log(`🔄 Fetching fresh search data for criteria:`, criteria);
      const freshResults = await this.fetchAndCacheSearchResults(criteria);
      return freshResults;
    } catch (error) {
      console.error("Company search failed:", error);
      return [];
    }
  }

  /**
   * Update all companies for a specific kommune (daily batch job)
   */
  async updateKommuneCompanies(kommuneNumber: string): Promise<number> {
    console.log(`🔄 Updating all companies for kommune ${kommuneNumber}...`);

    try {
      let updatedCount = 0;
      let page = 0;
      const pageSize = 500;

      while (true) {
        const response = await fetch(
          `https://data.brreg.no/enhetsregisteret/api/enheter?kommunenummer=${kommuneNumber}&size=${pageSize}&page=${page}`
        );

        if (!response.ok) break;

        const data = await response.json();
        if (!data._embedded?.enheter || data._embedded.enheter.length === 0) {
          break;
        }

        // Process batch
        for (const enhet of data._embedded.enheter) {
          await this.cacheCompanyFromAPI(enhet);
          updatedCount++;
        }

        page++;

        // Rate limiting using standardized delay
        await delay.betweenBronnøysundCalls();
      }

      console.log(
        `✅ Updated ${updatedCount} companies for kommune ${kommuneNumber}`
      );
      return updatedCount;
    } catch (error) {
      console.error(
        `Failed to update companies for kommune ${kommuneNumber}:`,
        error
      );
      return 0;
    }
  }

  /**
   * Network Analysis: Find all companies connected to a person
   */
  async getPersonNetwork(personName: string): Promise<{
    person: string;
    companies: CompanyRecord[];
    suspiciousPatterns: string[];
    riskScore: number;
  }> {
    const companies = (await prisma.$queryRaw`
      SELECT * FROM companies 
      WHERE key_persons::text ILIKE ${`%${personName}%`}
      ORDER BY risk_score DESC
    `) as CompanyRecord[];

    // Analyze patterns
    const suspiciousPatterns: string[] = [];
    let totalRisk = 0;

    for (const company of companies) {
      totalRisk += company.riskScore;

      // Check for multiple high-risk companies using standardized thresholds
      if (company.riskScore >= RISK_THRESHOLDS.HIGH) {
        suspiciousPatterns.push(`High-risk company: ${company.name}`);
      }

      // Check for generic address change patterns
      if (company.tags.includes("ADDRESS_MISMATCH")) {
        suspiciousPatterns.push(
          `Address change pattern detected: ${company.name}`
        );
      }
    }

    if (companies.length >= 3) {
      suspiciousPatterns.push(`Controls ${companies.length} companies`);
    }

    const avgRisk = companies.length > 0 ? totalRisk / companies.length : 0;

    return {
      person: personName,
      companies,
      suspiciousPatterns,
      riskScore: Math.min(avgRisk * (companies.length * 0.1 + 1), 100),
    };
  }

  /**
   * Network Analysis: Find companies sharing professional services
   */
  async getProfessionalServiceNetwork(serviceName: string): Promise<{
    service: string;
    clients: CompanyRecord[];
    suspiciousMovements: AddressHistory[];
    fraudRiskLevel: string;
  }> {
    // This would be implemented with more sophisticated service tracking
    // For now, return a placeholder structure

    return {
      service: serviceName,
      clients: [],
      suspiciousMovements: [],
      fraudRiskLevel: "LOW",
    };
  }

  // Private helper methods

  private async getCachedCompany(
    organizationNumber: string
  ): Promise<CompanyRecord | null> {
    try {
      const result = (await prisma.$queryRaw`
        SELECT * FROM companies 
        WHERE organization_number = ${organizationNumber}
        ORDER BY last_updated DESC 
        LIMIT 1
      `) as CompanyRecord[];

      return result.length > 0 ? result[0] : null;
    } catch (error) {
      console.error("Failed to get cached company:", error);
      return null;
    }
  }

  private isCacheValid(lastUpdated: Date): boolean {
    const now = new Date();
    const cacheAge = now.getTime() - lastUpdated.getTime();
    const maxAge = this.cacheValidityHours * 60 * 60 * 1000; // 12 hours in milliseconds

    return cacheAge < maxAge;
  }

  private async fetchAndCacheCompany(
    organizationNumber: string
  ): Promise<CompanyRecord | null> {
    try {
      const response = await fetch(
        `https://data.brreg.no/enhetsregisteret/api/enheter/${organizationNumber}`
      );

      if (!response.ok) return null;

      const data = await response.json();
      return await this.cacheCompanyFromAPI(data);
    } catch (error) {
      console.error(`Failed to fetch company ${organizationNumber}:`, error);
      return null;
    }
  }

  private async cacheCompanyFromAPI(apiData: any): Promise<CompanyRecord> {
    const company: CompanyRecord = {
      organizationNumber: apiData.organisasjonsnummer,
      name: apiData.navn,
      businessAddress: {
        address: apiData.forretningsadresse?.adresse || [],
        postalCode: apiData.forretningsadresse?.postnummer || "",
        city: apiData.forretningsadresse?.poststed || "",
        kommuneNumber: apiData.forretningsadresse?.kommunenummer || "",
        kommuneName: apiData.forretningsadresse?.kommune || "",
      },
      postalAddress: apiData.postadresse
        ? {
            address: apiData.postadresse.adresse || [],
            postalCode: apiData.postadresse.postnummer || "",
            city: apiData.postadresse.poststed || "",
            kommuneNumber: apiData.postadresse.kommunenummer || "",
            kommuneName: apiData.postadresse.kommune || "",
          }
        : undefined,
      industry: {
        code: apiData.naeringskode1?.kode || "",
        description: apiData.naeringskode1?.beskrivelse || "",
      },
      organizationForm: {
        code: apiData.organisasjonsform?.kode || "",
        description: apiData.organisasjonsform?.beskrivelse || "",
      },
      registrationDate: apiData.registreringsdatoEnhetsregisteret || "",
      lastUpdated: new Date(),
      keyPersons: [], // Would be populated from separate API calls
      riskScore: this.calculateRiskScore(apiData),
      tags: this.generateTags(apiData),
    };

    // Save to database
    await this.saveCompanyToDatabase(company);

    return company;
  }

  private calculateRiskScore(apiData: any): number {
    let risk = 0;

    // Industry risk using standardized factors
    const industryCode = apiData.naeringskode1?.kode;
    if (HIGH_RISK_INDUSTRIES.includes(industryCode as any)) {
      risk += RISK_FACTORS.HIGH_RISK_INDUSTRY;
    }

    // Address mismatch using standardized factors
    const businessKommune = apiData.forretningsadresse?.kommunenummer;
    const postKommune = apiData.postadresse?.kommunenummer;
    if (businessKommune !== postKommune) {
      risk += RISK_FACTORS.ADDRESS_MISMATCH;
    }

    // Recent registration using standardized factors and date utilities
    if (apiData.registreringsdatoEnhetsregisteret) {
      const regDate = new Date(apiData.registreringsdatoEnhetsregisteret);
      const oneYearAgo = dateUtils.yearsAgo(1);

      if (regDate > oneYearAgo) {
        risk += RISK_FACTORS.RECENT_REGISTRATION;
      }
    }

    // Bankruptcy entity check using standardized factors
    if (apiData.organisasjonsform?.kode === "KBO") {
      risk += RISK_FACTORS.BANKRUPTCY_ENTITY;
    }

    return Math.min(risk, 100);
  }

  private generateTags(apiData: any): string[] {
    const tags: string[] = [];

    // Generic address change detection
    if (
      apiData.forretningsadresse?.kommunenummer !==
      apiData.postadresse?.kommunenummer
    ) {
      tags.push("ADDRESS_MISMATCH");
    }

    // Generic industry risk assessment using standardized codes
    const industryCode = apiData.naeringskode1?.kode;
    if (HIGH_RISK_INDUSTRIES.includes(industryCode as any)) {
      tags.push("HIGH_RISK_INDUSTRY");
    }

    // Generic organizational form tags
    if (apiData.organisasjonsform?.kode === "KBO") {
      tags.push("BANKRUPTCY");
    }

    return tags;
  }

  private async saveCompanyToDatabase(company: CompanyRecord): Promise<void> {
    try {
      await prisma.$executeRaw`
        INSERT INTO companies (
          organization_number, name, business_address, postal_address,
          industry, organization_form, registration_date, last_updated,
          key_persons, risk_score, tags
        ) VALUES (
          ${company.organizationNumber}, ${company.name}, 
          ${JSON.stringify(company.businessAddress)}, ${JSON.stringify(company.postalAddress)},
          ${JSON.stringify(company.industry)}, ${JSON.stringify(company.organizationForm)},
          ${company.registrationDate}, ${company.lastUpdated},
          ${JSON.stringify(company.keyPersons)}, ${company.riskScore}, ${JSON.stringify(company.tags)}
        )
        ON CONFLICT (organization_number) 
        DO UPDATE SET
          name = EXCLUDED.name,
          business_address = EXCLUDED.business_address,
          postal_address = EXCLUDED.postal_address,
          industry = EXCLUDED.industry,
          organization_form = EXCLUDED.organization_form,
          registration_date = EXCLUDED.registration_date,
          last_updated = EXCLUDED.last_updated,
          key_persons = EXCLUDED.key_persons,
          risk_score = EXCLUDED.risk_score,
          tags = EXCLUDED.tags
      `;
    } catch (error) {
      console.error("Failed to save company to database:", error);
    }
  }

  private async searchCachedCompanies(criteria: any): Promise<CompanyRecord[]> {
    try {
      let whereClause = "";
      const params: any[] = [];

      if (criteria.kommuneNumber) {
        whereClause += "business_address->>'kommuneNumber' = $1";
        params.push(criteria.kommuneNumber);
      }

      if (criteria.riskScoreMin) {
        whereClause += whereClause ? " AND " : "";
        whereClause += `risk_score >= $${params.length + 1}`;
        params.push(criteria.riskScoreMin);
      }

      const query = `
        SELECT * FROM companies 
        ${whereClause ? `WHERE ${whereClause}` : ""}
        ORDER BY risk_score DESC, last_updated DESC
        LIMIT 100
      `;

      const result = (await prisma.$queryRawUnsafe(
        query,
        ...params
      )) as CompanyRecord[];
      return result;
    } catch (error) {
      console.error("Failed to search cached companies:", error);
      return [];
    }
  }

  private hasRecentSearchData(criteria: any): boolean {
    // Check if we have recent comprehensive data for this search criteria
    // For now, we'll be conservative and always fetch fresh data
    // In a production system, this would check cache timestamps
    return false;
  }

  private async fetchAndCacheSearchResults(
    criteria: any
  ): Promise<CompanyRecord[]> {
    try {
      // If searching by kommune, update all companies in that kommune
      if (criteria.kommuneNumber) {
        console.log(
          `🔄 Fetching fresh data for kommune ${criteria.kommuneNumber}`
        );
        await this.updateKommuneCompanies(criteria.kommuneNumber);

        // Return the cached results after update
        return await this.searchCachedCompanies(criteria);
      }

      // For other search criteria, return cached results
      return await this.searchCachedCompanies(criteria);
    } catch (error) {
      console.error("Failed to fetch and cache search results:", error);
      return [];
    }
  }
}
