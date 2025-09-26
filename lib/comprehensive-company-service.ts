/**
 * Comprehensive Company Service
 *
 * This service manages ALL companies in Norway, not just bankruptcies.
 * It tracks address histories and generates risk alerts for fraud detection.
 */

import { prisma } from "./database";
import { delay } from "./config/api-delays";
import { dateUtils } from "./config/date-utils";
import { PAGINATION } from "./config/constants";
import { RISK_THRESHOLDS } from "./config/risk-thresholds";
import { optimizedCompanyService } from "./optimized-company-service";

interface CompanyData {
  organizationNumber: string;
  name: string;
  organizationForm?: string;
  status?: string;
  registrationDate?: string;
  industry?: string;
  industryCode?: string;
  businessAddress?: any;
  postalAddress?: any;
  currentAddress?: string;
  currentPostalCode?: string;
  currentCity?: string;
  bankruptcyDate?: string;
}

interface AddressHistoryEntry {
  address: string;
  postalCode?: string;
  city?: string;
  kommuneNumber?: string;
  kommuneName?: string;
  fromDate?: string;
  toDate?: string;
  addressType: "business" | "postal" | "both";
}

export class ComprehensiveCompanyService {
  /**
   * Fetch and store ALL companies from a specific kommune
   */
  async updateAllCompaniesInKommune(kommuneNumber: string): Promise<{
    totalCompanies: number;
    newCompanies: number;
    updatedCompanies: number;
    alertsGenerated: number;
  }> {
    console.log(
      `🏢 Starting comprehensive company update for kommune ${kommuneNumber}`
    );

    let totalCompanies = 0;
    let newCompanies = 0;
    let updatedCompanies = 0;
    let alertsGenerated = 0;
    const allCompanies: CompanyData[] = []; // Collect all companies for batch processing

    try {
      // Fetch companies from Brønnøysundregistrene API
      const enhetsregisterUrl =
        "https://data.brreg.no/enhetsregisteret/api/enheter";
      const maxPages = PAGINATION.MAX_PAGES_DEEP_SCAN;

      for (let page = 0; page < maxPages; page++) {
        console.log(
          `📄 Fetching page ${page + 1}/${maxPages} for kommune ${kommuneNumber}...`
        );

        const searchParams = new URLSearchParams({
          kommunenummer: kommuneNumber,
          size: PAGINATION.LARGE_PAGE_SIZE.toString(),
          page: page.toString(),
        });

        const response = await fetch(`${enhetsregisterUrl}?${searchParams}`, {
          method: "GET",
          headers: {
            Accept: "application/json",
            "User-Agent": "konkurser-i-norge-comprehensive-scanner/1.0",
          },
        });

        if (!response.ok) {
          console.warn(`Failed to fetch page ${page}: ${response.status}`);
          break;
        }

        const data = await response.json();

        if (!data._embedded?.enheter || data._embedded.enheter.length === 0) {
          console.log(
            `No more companies on page ${page + 1}, stopping pagination.`
          );
          break;
        }

        // Process each company
        for (const enhet of data._embedded.enheter) {
          if (enhet.organisasjonsnummer && enhet.navn) {
            totalCompanies++;

            // Convert API data to our format
            const companyData: CompanyData = {
              organizationNumber: enhet.organisasjonsnummer,
              name: enhet.navn,
              organizationForm: enhet.organisasjonsform?.kode,
              status: this.determineCompanyStatus(enhet),
              registrationDate: enhet.registreringsdatoEnhetsregisteret,
              industry: enhet.naeringskode1?.beskrivelse,
              industryCode: enhet.naeringskode1?.kode,
              businessAddress: enhet.forretningsadresse,
              postalAddress: enhet.postadresse,
              currentAddress: this.formatAddress(enhet.forretningsadresse),
              currentPostalCode: enhet.forretningsadresse?.postnummer,
              currentCity: enhet.forretningsadresse?.poststed,
              bankruptcyDate: this.getBankruptcyDate(enhet),
            };

            // Add to batch for optimized processing
            allCompanies.push(companyData);
          }
        }

        // Delay between pages
        await delay.betweenApiBatches();
      }

      // Process all collected companies using optimized batch operations
      if (allCompanies.length > 0) {
        console.log(
          `🚀 Processing ${allCompanies.length} companies using optimized batch operations...`
        );

        const batchResult = await optimizedCompanyService.batchSaveCompanies(
          allCompanies,
          kommuneNumber
        );

        newCompanies = batchResult.newCompanies;
        updatedCompanies = batchResult.updatedCompanies;
        alertsGenerated = batchResult.alertsGenerated;

        console.log(
          `✅ Batch processing complete in ${batchResult.processingTimeMs}ms`
        );
      }

      console.log(`✅ Company update complete for kommune ${kommuneNumber}:`);
      console.log(`   📊 Total companies processed: ${totalCompanies}`);
      console.log(`   🆕 New companies added: ${newCompanies}`);
      console.log(`   🔄 Companies updated: ${updatedCompanies}`);
      console.log(`   🚨 Risk alerts generated: ${alertsGenerated}`);

      return {
        totalCompanies,
        newCompanies,
        updatedCompanies,
        alertsGenerated,
      };
    } catch (error) {
      console.error(
        `❌ Failed to update companies for kommune ${kommuneNumber}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Get companies with historical connections to a kommune
   */
  async getCompaniesWithHistoricalConnections(kommuneNumber: string): Promise<{
    currentCompanies: any[];
    historicalConnections: any[];
    bankruptcyAlerts: any[];
  }> {
    try {
      // Get companies currently in this kommune
      const currentCompanies = await prisma.company.findMany({
        where: {
          currentKommune: {
            kommuneNumber: kommuneNumber,
          },
        },
        include: {
          riskAlerts: {
            where: { isActive: true },
          },
        },
        orderBy: {
          lastUpdated: "desc",
        },
      });

      // Get companies with historical address connections to this kommune
      const historicalConnections = await prisma.company.findMany({
        where: {
          AND: [
            // Not currently in this kommune
            {
              NOT: {
                currentKommune: {
                  kommuneNumber: kommuneNumber,
                },
              },
            },
            // But has address history in this kommune
            {
              addressHistory: {
                some: {
                  kommuneNumber: kommuneNumber,
                },
              },
            },
          ],
        },
        include: {
          addressHistory: {
            where: {
              kommuneNumber: kommuneNumber,
            },
          },
          riskAlerts: {
            where: {
              isActive: true,
              kommuneNumber: kommuneNumber,
            },
          },
        },
        orderBy: {
          lastUpdated: "desc",
        },
      });

      // Get bankruptcy alerts specifically for this kommune
      const bankruptcyAlerts = await prisma.company.findMany({
        where: {
          AND: [
            { status: "BANKRUPTCY" },
            {
              OR: [
                // Currently in this kommune and bankrupt
                {
                  currentKommune: {
                    kommuneNumber: kommuneNumber,
                  },
                },
                // Has historical connection and is bankrupt
                {
                  addressHistory: {
                    some: {
                      kommuneNumber: kommuneNumber,
                    },
                  },
                },
              ],
            },
          ],
        },
        include: {
          addressHistory: {
            where: {
              kommuneNumber: kommuneNumber,
            },
          },
          riskAlerts: {
            where: {
              isActive: true,
              alertType: {
                in: [
                  "BANKRUPTCY_RISK",
                  "ADDRESS_FRAUD",
                  "HISTORICAL_CONNECTION",
                ],
              },
            },
          },
        },
        orderBy: {
          lastUpdated: "desc",
        },
      });

      return {
        currentCompanies,
        historicalConnections,
        bankruptcyAlerts,
      };
    } catch (error) {
      console.error(
        `❌ Failed to get historical connections for kommune ${kommuneNumber}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Save or update a company in the database
   */
  private async saveCompany(
    companyData: CompanyData,
    kommuneNumber: string
  ): Promise<{ isNew: boolean; companyId: string }> {
    try {
      // Find or create the kommune
      let kommune = await prisma.kommune.findUnique({
        where: { kommuneNumber },
      });

      if (!kommune) {
        kommune = await prisma.kommune.create({
          data: {
            kommuneNumber,
            name: `Kommune ${kommuneNumber}`,
            county: "Ukjent fylke",
          },
        });
      }

      // Calculate risk score
      const riskScore = this.calculateRiskScore(companyData);

      // Upsert the company
      const company = await prisma.company.upsert({
        where: {
          organizationNumber: companyData.organizationNumber,
        },
        update: {
          name: companyData.name,
          organizationForm: companyData.organizationForm,
          status: companyData.status,
          industry: companyData.industry,
          industryCode: companyData.industryCode,
          currentKommuneId: kommune.id,
          currentAddress: this.formatAddress(companyData.businessAddress),
          currentPostalCode: companyData.businessAddress?.postnummer,
          currentCity: companyData.businessAddress?.poststed,
          businessAddress: companyData.businessAddress,
          postalAddress: companyData.postalAddress,
          // bankruptcyDate field doesn't exist in schema - skipping
          lastUpdated: new Date(),
        },
        create: {
          organizationNumber: companyData.organizationNumber,
          name: companyData.name,
          organizationForm: companyData.organizationForm,
          status: companyData.status,
          registrationDate: companyData.registrationDate
            ? new Date(companyData.registrationDate)
            : null,
          industry: companyData.industry,
          industryCode: companyData.industryCode,
          currentKommuneId: kommune.id,
          currentAddress: this.formatAddress(companyData.businessAddress),
          currentPostalCode: companyData.businessAddress?.postnummer,
          currentCity: companyData.businessAddress?.poststed,
          businessAddress: companyData.businessAddress,
          postalAddress: companyData.postalAddress,
          // bankruptcyDate field doesn't exist in schema - skipping
        },
      });

      // Save address history
      await this.saveAddressHistory(company.id, companyData);

      const isNew = company.createdAt.getTime() === company.lastUpdated.getTime();
      return { isNew, companyId: company.id };
    } catch (error) {
      console.error(
        `❌ Failed to save company ${companyData.organizationNumber}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Save address history for a company
   */
  private async saveAddressHistory(
    companyId: string,
    companyData: CompanyData
  ): Promise<void> {
    const histories: AddressHistoryEntry[] = [];

    // Business address
    if (companyData.businessAddress) {
      histories.push({
        address: this.formatAddress(companyData.businessAddress),
        postalCode: companyData.businessAddress.postnummer,
        city: companyData.businessAddress.poststed,
        kommuneNumber: companyData.businessAddress.kommunenummer,
        kommuneName: companyData.businessAddress.poststed,
        addressType: "business",
        fromDate: companyData.registrationDate,
        isCurrentAddress: true,
      } as any);
    }

    // Postal address (if different)
    if (
      companyData.postalAddress &&
      JSON.stringify(companyData.postalAddress) !==
        JSON.stringify(companyData.businessAddress)
    ) {
      histories.push({
        address: this.formatAddress(companyData.postalAddress),
        postalCode: companyData.postalAddress.postnummer,
        city: companyData.postalAddress.poststed,
        kommuneNumber: companyData.postalAddress.kommunenummer,
        kommuneName: companyData.postalAddress.poststed,
        addressType: "postal",
        fromDate: companyData.registrationDate,
        isCurrentAddress: true,
      } as any);
    }

    // Save address histories
    for (const history of histories) {
      await prisma.companyAddressHistory.upsert({
        where: {
          id: `${companyId}-${history.addressType}-${Buffer.from(history.address).toString("base64").slice(0, 20)}`,
        },
        update: {
          isCurrentAddress: true, // Default to current address
        },
        create: {
          companyId,
          organizationNumber: companyData.organizationNumber,
          address: history.address,
          postalCode: history.postalCode,
          city: history.city,
          kommuneNumber: history.kommuneNumber,
          kommuneName: history.kommuneName,
          addressType: history.addressType,
          fromDate: history.fromDate ? new Date(history.fromDate) : null,
          isCurrentAddress: true, // Default to current address
        },
      });
    }
  }

  /**
   * Generate risk alerts for a company
   */
  private async generateRiskAlerts(
    companyData: CompanyData,
    kommuneNumber: string
  ): Promise<number> {
    let alertsGenerated = 0;

    try {
      const company = await prisma.company.findUnique({
        where: { organizationNumber: companyData.organizationNumber },
        include: { addressHistory: true },
      });

      if (!company) return 0;

      // Alert 1: Bankruptcy with historical connections
      const isBankrupt = this.isBankruptCompany({
        organisasjonsform: { kode: companyData.organizationForm },
        konkursdato: companyData.bankruptcyDate,
      });
      if (isBankrupt) {
        const hasHistoricalConnection = company.addressHistory.some(
          (addr) => addr.kommuneNumber !== kommuneNumber && addr.kommuneNumber
        );

        if (hasHistoricalConnection) {
          await this.createRiskAlert(company.id, {
            alertType: "ADDRESS_FRAUD",
            riskLevel: "CRITICAL",
            kommuneNumber,
            title: "🚨 BANKRUPTCY FRAUD ALERT",
            description: `Company went bankrupt but has historical address connections to multiple kommuner. Potential address manipulation fraud.`,
            metadata: {
              bankruptcyDate: companyData.bankruptcyDate,
              addressHistoryCount: company.addressHistory.length,
            },
          });
          alertsGenerated++;
        }
      }

      // Alert 2: Historical connection to kommune
      const hasKommuneConnection = company.addressHistory.some(
        (addr) => addr.kommuneNumber === kommuneNumber
      );

      if (
        hasKommuneConnection &&
        company.currentKommuneId !== kommuneNumber
      ) {
        await this.createRiskAlert(company.id, {
          alertType: "HISTORICAL_CONNECTION",
          riskLevel: isBankrupt ? "HIGH" : "MEDIUM",
          kommuneNumber,
          title: "⚠️ Historical Address Connection",
          description: `Company previously had addresses in this kommune. Monitor for potential fraud patterns.`,
          metadata: {
            currentKommune: company.currentKommuneId,
            isBankrupt: isBankrupt,
          },
        });
        alertsGenerated++;
      }

      return alertsGenerated;
    } catch (error) {
      console.error(
        `❌ Failed to generate risk alerts for ${companyData.organizationNumber}:`,
        error
      );
      return 0;
    }
  }

  /**
   * Create a risk alert
   */
  private async createRiskAlert(
    companyId: string,
    alertData: {
      alertType: string;
      riskLevel: string;
      kommuneNumber?: string;
      title: string;
      description: string;
      metadata?: any;
    }
  ): Promise<void> {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company) return;

    await prisma.companyRiskAlert.create({
      data: {
        companyId,
        organizationNumber: company.organizationNumber,
        alertType: alertData.alertType,
        riskLevel: alertData.riskLevel,
        kommuneNumber: alertData.kommuneNumber,
        title: alertData.title,
        description: alertData.description,
        metadata: alertData.metadata,
      },
    });
  }

  /**
   * Helper methods
   */
  private determineCompanyStatus(enhet: any): string {
    if (enhet.organisasjonsform?.kode === "KBO") return "BANKRUPTCY";
    if (enhet.konkurs === true) return "BANKRUPTCY";
    if (enhet.slettedato) return "DISSOLVED";
    return "ACTIVE";
  }

  private isBankruptCompany(enhet: any): boolean {
    return (
      enhet.organisasjonsform?.kode === "KBO" ||
      enhet.konkurs === true ||
      enhet.konkursdato !== null
    );
  }

  private getBankruptcyDate(enhet: any): string | undefined {
    return (
      enhet.konkursdato ||
      (enhet.organisasjonsform?.kode === "KBO"
        ? enhet.stiftelsesdato
        : undefined)
    );
  }

  private formatAddress(addr: any): string {
    if (!addr) return "";
    const parts = [];
    if (addr.adresse && addr.adresse.length > 0) {
      parts.push(addr.adresse.join(" "));
    }
    if (addr.postnummer) parts.push(addr.postnummer);
    if (addr.poststed) parts.push(addr.poststed);
    return parts.join(", ");
  }

  private calculateRiskScore(companyData: CompanyData): number {
    let score = 0;

    // Bankruptcy adds significant risk
    const isBankrupt = this.isBankruptCompany({
      organisasjonsform: { kode: companyData.organizationForm },
      konkursdato: companyData.bankruptcyDate,
    });
    if (isBankrupt) score += 50;

    // Shell company indicators
    if (companyData.organizationForm === "KBO") score += 30;

    // Recent registration with quick bankruptcy
    if (companyData.registrationDate && companyData.bankruptcyDate) {
      const regDate = new Date(companyData.registrationDate);
      const bankDate = new Date(companyData.bankruptcyDate);
      const daysDiff = Math.floor(
        (bankDate.getTime() - regDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysDiff < 365) score += 40; // Less than 1 year
      if (daysDiff < 180) score += 20; // Less than 6 months
    }

    return Math.min(score, 100); // Cap at 100
  }
}
