/**
 * Optimized Company Service
 *
 * Provides efficient company data persistence with:
 * - Batch operations for high performance
 * - Transaction management for consistency
 * - Smart caching with TTL
 * - Unified interface for all company operations
 */

import { prisma } from "./database";
import { Prisma } from "@prisma/client";

export interface CompanyData {
  organizationNumber: string;
  name: string;
  organizationForm?: string;
  status?: string;
  registrationDate?: Date | string;
  industry?: string;
  industryCode?: string;
  businessAddress?: any;
  postalAddress?: any;
  isBankrupt?: boolean;
  bankruptcyDate?: Date | string;
  riskScore?: number;
}

export interface CompanyConnectionData {
  organizationNumber: string;
  name: string;
  currentAddress?: string;
  connection: {
    type: string;
    evidence: string;
    confidence: "HIGH" | "MEDIUM" | "LOW";
    discoveredAt: Date;
  };
  riskScore?: number;
  riskAlerts?: Array<{
    alertType: string;
    riskLevel: string;
    title: string;
    description: string;
    metadata?: any;
  }>;
}

export interface BatchSaveResult {
  totalProcessed: number;
  newCompanies: number;
  updatedCompanies: number;
  alertsGenerated: number;
  errors: Array<{ organizationNumber: string; error: string }>;
  processingTimeMs: number;
}

export class OptimizedCompanyService {
  private static instance: OptimizedCompanyService;
  private cache = new Map<
    string,
    { data: any; timestamp: number; ttl: number }
  >();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
  private readonly BATCH_SIZE = 100;

  public static getInstance(): OptimizedCompanyService {
    if (!OptimizedCompanyService.instance) {
      OptimizedCompanyService.instance = new OptimizedCompanyService();
    }
    return OptimizedCompanyService.instance;
  }

  /**
   * Batch save companies with optimal performance
   */
  async batchSaveCompanies(
    companies: CompanyData[],
    kommuneNumber: string
  ): Promise<BatchSaveResult> {
    const startTime = Date.now();
    const result: BatchSaveResult = {
      totalProcessed: 0,
      newCompanies: 0,
      updatedCompanies: 0,
      alertsGenerated: 0,
      errors: [],
      processingTimeMs: 0,
    };

    try {
      // Ensure kommune exists
      await this.ensureKommuneExists(kommuneNumber);

      // Process in batches to avoid memory issues
      const batches = this.chunkArray(companies, this.BATCH_SIZE);

      for (const batch of batches) {
        try {
          const batchResult = await this.processBatch(batch, kommuneNumber);
          result.totalProcessed += batchResult.totalProcessed;
          result.newCompanies += batchResult.newCompanies;
          result.updatedCompanies += batchResult.updatedCompanies;
          result.alertsGenerated += batchResult.alertsGenerated;
          result.errors.push(...batchResult.errors);
        } catch (error) {
          console.error("Batch processing error:", error);
          // Continue with next batch
        }
      }
    } catch (error) {
      console.error("Batch save companies error:", error);
      throw error;
    }

    result.processingTimeMs = Date.now() - startTime;
    return result;
  }

  /**
   * Save company connections with risk alerts
   */
  async batchSaveConnections(
    connections: CompanyConnectionData[],
    kommuneNumber: string
  ): Promise<BatchSaveResult> {
    const startTime = Date.now();
    const result: BatchSaveResult = {
      totalProcessed: 0,
      newCompanies: 0,
      updatedCompanies: 0,
      alertsGenerated: 0,
      errors: [],
      processingTimeMs: 0,
    };

    try {
      await this.ensureKommuneExists(kommuneNumber);

      return await prisma.$transaction(async (tx) => {
        for (const connection of connections) {
          try {
            // Upsert company
            const company = await tx.company.upsert({
              where: { organizationNumber: connection.organizationNumber },
              update: {
                name: connection.name,
                currentAddress: connection.currentAddress,
                // riskScore: connection.riskScore || 0, // Field not in schema
                lastUpdated: new Date(),
              },
              create: {
                organizationNumber: connection.organizationNumber,
                name: connection.name,
                currentAddress: connection.currentAddress,
                // riskScore: connection.riskScore || 0, // Field not in schema
                currentKommune: {
                  connect: { kommuneNumber },
                },
              },
              select: { id: true, createdAt: true },
            });

            const isNew = company.createdAt.getTime() > Date.now() - 1000; // Created in last second
            if (isNew) {
              result.newCompanies++;
            } else {
              result.updatedCompanies++;
            }

            // Create risk alert for historical connection
            await tx.companyRiskAlert.upsert({
              where: {
                companyId_alertType_kommuneNumber: {
                  companyId: company.id,
                  alertType: "HISTORICAL_CONNECTION",
                  kommuneNumber: kommuneNumber,
                },
              },
              update: {
                riskLevel:
                  connection.connection.confidence === "HIGH"
                    ? "HIGH"
                    : "MEDIUM",
                description: connection.connection.evidence,
                metadata: {
                  connectionType: connection.connection.type,
                  discoveredAt: connection.connection.discoveredAt,
                },
                isActive: true,
              },
              create: {
                companyId: company.id,
                organizationNumber: connection.organizationNumber,
                alertType: "HISTORICAL_CONNECTION",
                riskLevel:
                  connection.connection.confidence === "HIGH"
                    ? "HIGH"
                    : "MEDIUM",
                kommuneNumber: kommuneNumber,
                title: `Historical connection to kommune ${kommuneNumber}`,
                description: connection.connection.evidence,
                metadata: {
                  connectionType: connection.connection.type,
                  discoveredAt: connection.connection.discoveredAt,
                },
              },
            });

            result.alertsGenerated++;

            // Add additional risk alerts if provided
            if (connection.riskAlerts) {
              for (const alert of connection.riskAlerts) {
                await tx.companyRiskAlert.upsert({
                  where: {
                    companyId_alertType_kommuneNumber: {
                      companyId: company.id,
                      alertType: alert.alertType,
                      kommuneNumber: kommuneNumber,
                    },
                  },
                  update: {
                    riskLevel: alert.riskLevel,
                    title: alert.title,
                    description: alert.description,
                    metadata: alert.metadata,
                    isActive: true,
                  },
                  create: {
                    companyId: company.id,
                    organizationNumber: connection.organizationNumber,
                    alertType: alert.alertType,
                    riskLevel: alert.riskLevel,
                    kommuneNumber: kommuneNumber,
                    title: alert.title,
                    description: alert.description,
                    metadata: alert.metadata,
                  },
                });
                result.alertsGenerated++;
              }
            }

            result.totalProcessed++;
          } catch (error) {
            console.error(
              `Error processing connection for ${connection.organizationNumber}:`,
              error
            );
            result.errors.push({
              organizationNumber: connection.organizationNumber,
              error: error instanceof Error ? error.message : "Unknown error",
            });
          }
        }

        result.processingTimeMs = Date.now() - startTime;
        return result;
      });
    } catch (error) {
      console.error("Batch save connections error:", error);
      throw error;
    }
  }

  /**
   * Get cached company connections for instant response
   */
  async getCachedConnections(
    kommuneNumber: string
  ): Promise<CompanyConnectionData[]> {
    const cacheKey = `connections_${kommuneNumber}`;
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      return cached.data;
    }

    try {
      const companies = await prisma.company.findMany({
        where: {
          riskAlerts: {
            some: {
              kommuneNumber: kommuneNumber,
              isActive: true,
            },
          },
        },
        include: {
          riskAlerts: {
            where: {
              kommuneNumber: kommuneNumber,
              isActive: true,
            },
          },
          riskProfile: true, // Include risk profile for risk score
        },
        orderBy: { lastUpdated: "desc" }, // Use lastUpdated instead of riskScore
        take: 100, // Limit for performance
      });

      const connections: CompanyConnectionData[] = companies.map((company) => ({
        organizationNumber: company.organizationNumber,
        name: company.name,
        currentAddress: company.currentAddress || "Ukjent adresse",
        connection: {
          type: company.riskAlerts[0]?.alertType || "UNKNOWN",
          evidence: company.riskAlerts[0]?.description || "No evidence",
          confidence: (company.riskAlerts[0]?.riskLevel === "HIGH"
            ? "HIGH"
            : company.riskAlerts[0]?.riskLevel === "MEDIUM"
              ? "MEDIUM"
              : "LOW") as "HIGH" | "MEDIUM" | "LOW",
          discoveredAt: company.riskAlerts[0]?.triggeredAt || new Date(),
        },
        riskScore: company.riskProfile?.riskScore || 0,
        riskAlerts: company.riskAlerts.map((alert) => ({
          alertType: alert.alertType,
          riskLevel: alert.riskLevel,
          title: alert.title,
          description: alert.description,
          metadata: alert.metadata,
        })),
      }));

      // Cache the result
      this.cache.set(cacheKey, {
        data: connections,
        timestamp: Date.now(),
        ttl: this.CACHE_TTL_MS,
      });

      return connections;
    } catch (error) {
      console.error("Error getting cached connections:", error);
      return [];
    }
  }

  /**
   * Get companies by kommune with pagination
   */
  async getCompaniesByKommune(
    kommuneNumber: string,
    options: {
      page?: number;
      limit?: number;
      includeRiskAlerts?: boolean;
      minRiskScore?: number;
    } = {}
  ) {
    const {
      page = 1,
      limit = 50,
      includeRiskAlerts = true,
      minRiskScore = 0,
    } = options;
    const offset = (page - 1) * limit;

    try {
      const where: Prisma.CompanyWhereInput = {
        currentKommune: { kommuneNumber },
        riskProfile: { riskScore: { gte: minRiskScore } },
      };

      const [companies, total] = await Promise.all([
        prisma.company.findMany({
          where,
          include: includeRiskAlerts
            ? {
                riskAlerts: {
                  where: { isActive: true },
                  orderBy: { triggeredAt: "desc" },
                },
              }
            : undefined,
          orderBy: { lastUpdated: "desc" },
          skip: offset,
          take: limit,
        }),
        prisma.company.count({ where }),
      ]);

      return {
        companies,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      console.error("Error getting companies by kommune:", error);
      throw error;
    }
  }

  /**
   * Update company risk scores in batch
   */
  async updateRiskScores(
    updates: Array<{ organizationNumber: string; riskScore: number }>
  ) {
    try {
      return await prisma.$transaction(
        updates.map((update) =>
          prisma.company.update({
            where: { organizationNumber: update.organizationNumber },
            data: {
              lastUpdated: new Date(),
              riskProfile: {
                upsert: {
                  create: {
                    organizationNumber: update.organizationNumber,
                    riskLevel: "HIGH",
                    riskScore: update.riskScore,
                  },
                  update: { riskScore: update.riskScore },
                },
              },
            },
          })
        )
      );
    } catch (error) {
      console.error("Error updating risk scores:", error);
      throw error;
    }
  }

  /**
   * Clear cache for specific kommune
   */
  clearCache(kommuneNumber?: string) {
    if (kommuneNumber) {
      const keysToDelete = Array.from(this.cache.keys()).filter((key) =>
        key.includes(kommuneNumber)
      );
      keysToDelete.forEach((key) => this.cache.delete(key));
    } else {
      this.cache.clear();
    }
  }

  // Private helper methods

  private async processBatch(
    batch: CompanyData[],
    kommuneNumber: string
  ): Promise<BatchSaveResult> {
    const result: BatchSaveResult = {
      totalProcessed: 0,
      newCompanies: 0,
      updatedCompanies: 0,
      alertsGenerated: 0,
      errors: [],
      processingTimeMs: 0,
    };

    return await prisma.$transaction(async (tx) => {
      const kommune = await tx.kommune.findUnique({
        where: { kommuneNumber },
        select: { id: true },
      });

      if (!kommune) {
        throw new Error(`Kommune ${kommuneNumber} not found`);
      }

      for (const companyData of batch) {
        try {
          const company = await tx.company.upsert({
            where: { organizationNumber: companyData.organizationNumber },
            update: {
              name: companyData.name,
              organizationForm: companyData.organizationForm,
              status: companyData.status,
              registrationDate: companyData.registrationDate
                ? new Date(companyData.registrationDate)
                : null,
              industry: companyData.industry,
              industryCode: companyData.industryCode,
              currentKommuneId: kommune.id,
              businessAddress: companyData.businessAddress,
              postalAddress: companyData.postalAddress,
              // currentAddress, currentPostalCode, currentCity not in CompanyData interface
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
              businessAddress: companyData.businessAddress,
              postalAddress: companyData.postalAddress,
              // currentAddress, currentPostalCode, currentCity not in CompanyData interface
            },
            select: { id: true, createdAt: true },
          });

          const isNew = company.createdAt.getTime() > Date.now() - 1000;
          if (isNew) {
            result.newCompanies++;
          } else {
            result.updatedCompanies++;
          }

          result.totalProcessed++;
        } catch (error) {
          console.error(
            `Error processing company ${companyData.organizationNumber}:`,
            error
          );
          result.errors.push({
            organizationNumber: companyData.organizationNumber,
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }

      return result;
    });
  }

  private async ensureKommuneExists(kommuneNumber: string) {
    await prisma.kommune.upsert({
      where: { kommuneNumber },
      update: {},
      create: {
        kommuneNumber,
        name: `Kommune ${kommuneNumber}`,
        county: "Ukjent fylke",
      },
    });
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}

// Export singleton instance
export const optimizedCompanyService = OptimizedCompanyService.getInstance();
