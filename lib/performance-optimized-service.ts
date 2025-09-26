import { PrismaClient } from "@prisma/client";
import { LRUCache } from "lru-cache";

const prisma = new PrismaClient();

// Performance-optimized caching
const cache = new LRUCache<string, any>({
  max: 1000, // Maximum 1000 cached items
  ttl: 1000 * 60 * 5, // 5 minutes TTL
});

interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

interface AddressMovementSummary {
  totalMovements: number;
  outOfKommune: number;
  intoKommune: number;
  withinKommune: number;
  highRiskMovements: number;
  recentMovements: number;
}

export class PerformanceOptimizedService {
  // Optimized kommune data with pagination and caching
  async getKommunerOptimized(
    page: number = 1,
    limit: number = 20,
    search?: string
  ): Promise<PaginatedResult<any>> {
    const cacheKey = `kommuner_${page}_${limit}_${search || "all"}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const skip = (page - 1) * limit;

    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { county: { contains: search, mode: "insensitive" as const } },
            { kommuneNumber: { contains: search } },
          ],
        }
      : {};

    const [kommuner, total] = await Promise.all([
      prisma.kommune.findMany({
        where,
        skip,
        take: limit,
        include: {
          _count: {
            select: {
              companies: true,
              bankruptcies: true,
              postalCodes: true,
              addressChanges: true,
            },
          },
        },
        orderBy: [{ priority: "asc" }, { name: "asc" }],
      }),
      prisma.kommune.count({ where }),
    ]);

    // Get company counts efficiently
    const kommuneNumbers = kommuner.map((k) => k.kommuneNumber);
    const companyCounts = await prisma.company.groupBy({
      by: ["currentKommuneId"],
      where: {
        currentKommune: { kommuneNumber: { in: kommuneNumbers } },
      },
      _count: { organizationNumber: true },
    });

    const companyCountMap = new Map(
      companyCounts.map((c) => [
        c.currentKommuneId,
        c._count?.organizationNumber || 0,
      ])
    );

    const enhancedKommuner = kommuner.map((kommune) => ({
      ...kommune,
      companyCount: companyCountMap.get(kommune.kommuneNumber) || 0,
      hasData: (companyCountMap.get(kommune.kommuneNumber) || 0) > 0,
      dataQuality: this.calculateDataQuality(
        companyCountMap.get(kommune.kommuneNumber) || 0,
        kommune._count.postalCodes
      ),
    }));

    const result = {
      data: enhancedKommuner,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    };

    cache.set(cacheKey, result);
    return result;
  }

  // Optimized address movement detection with summary
  async getAddressMovementSummary(
    kommuneNumber: string,
    timeframeDays: number = 365
  ): Promise<AddressMovementSummary> {
    const cacheKey = `movement_summary_${kommuneNumber}_${timeframeDays}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - timeframeDays);

    // Get all companies with address history in this kommune
    const companies = await prisma.company.findMany({
      where: {
        OR: [
          { currentKommune: { kommuneNumber: kommuneNumber } },
          {
            addressHistory: {
              some: {
                kommuneNumber: kommuneNumber,
                createdAt: { gte: cutoffDate },
              },
            },
          },
        ],
      },
      include: {
        addressHistory: {
          where: {
            createdAt: { gte: cutoffDate },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    let totalMovements = 0;
    let outOfKommune = 0;
    let intoKommune = 0;
    let withinKommune = 0;
    let highRiskMovements = 0;
    let recentMovements = 0;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    for (const company of companies) {
      const history = company.addressHistory;
      if (history.length < 2) continue;

      for (let i = 0; i < history.length - 1; i++) {
        const current = history[i];
        const previous = history[i + 1];

        // Skip if addresses are identical
        if (this.areAddressesIdentical(current, previous)) continue;

        totalMovements++;

        // Categorize movement
        if (
          previous.kommuneNumber === kommuneNumber &&
          current.kommuneNumber !== kommuneNumber
        ) {
          outOfKommune++;
        } else if (
          previous.kommuneNumber !== kommuneNumber &&
          current.kommuneNumber === kommuneNumber
        ) {
          intoKommune++;
        } else if (
          previous.kommuneNumber === kommuneNumber &&
          current.kommuneNumber === kommuneNumber
        ) {
          withinKommune++;
        }

        // Check if high risk (rapid movement)
        const daysDiff = Math.abs(
          (current.createdAt.getTime() - previous.createdAt.getTime()) /
            (1000 * 60 * 60 * 24)
        );
        if (daysDiff < 30) {
          highRiskMovements++;
        }

        // Check if recent
        if (current.createdAt >= thirtyDaysAgo) {
          recentMovements++;
        }
      }
    }

    const summary = {
      totalMovements,
      outOfKommune,
      intoKommune,
      withinKommune,
      highRiskMovements,
      recentMovements,
    };

    cache.set(cacheKey, summary);
    return summary;
  }

  // Optimized company search with full-text capabilities
  async searchCompaniesOptimized(
    query: string,
    kommuneNumber?: string,
    page: number = 1,
    limit: number = 50
  ): Promise<PaginatedResult<any>> {
    const cacheKey = `company_search_${query}_${kommuneNumber || "all"}_${page}_${limit}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const skip = (page - 1) * limit;

    const where: any = {
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { organizationNumber: { contains: query } },
        { currentAddress: { contains: query, mode: "insensitive" } },
        { currentCity: { contains: query, mode: "insensitive" } },
      ],
    };

    if (kommuneNumber) {
      where.currentKommuneNumber = kommuneNumber;
    }

    const [companies, total] = await Promise.all([
      prisma.company.findMany({
        where,
        skip,
        take: limit,
        include: {
          _count: {
            select: {
              addressHistory: true,
            },
          },
        },
        orderBy: [{ lastUpdated: "desc" }],
      }),
      prisma.company.count({ where }),
    ]);

    const result = {
      data: companies,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    };

    cache.set(cacheKey, result);
    return result;
  }

  // Optimized high-risk company detection
  async getHighRiskCompanies(
    kommuneNumber?: string,
    limit: number = 100
  ): Promise<any[]> {
    const cacheKey = `high_risk_${kommuneNumber || "all"}_${limit}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const where: any = {
      OR: [
        { riskScore: { gte: 50 } },
        { isBankrupt: true },
        { isUnderLiquidation: true },
        { isUnderForcedLiquidation: true },
      ],
    };

    if (kommuneNumber) {
      where.currentKommuneNumber = kommuneNumber;
    }

    const companies = await prisma.company.findMany({
      where,
      take: limit,
      include: {
        _count: {
          select: {
            addressHistory: true,
          },
        },
      },
      orderBy: [{ lastUpdated: "desc" }],
    });

    cache.set(cacheKey, companies);
    return companies;
  }

  // Performance metrics
  async getPerformanceMetrics(): Promise<{
    cacheStats: any;
    databaseStats: any;
    systemHealth: string;
  }> {
    const [companyCount, kommuneCount, addressHistoryCount] = await Promise.all(
      [
        prisma.company.count(),
        prisma.kommune.count(),
        prisma.companyAddressHistory.count(),
      ]
    );

    return {
      cacheStats: {
        size: cache.size,
        maxSize: cache.max,
        hitRate: cache.calculatedSize / (cache.calculatedSize + cache.size),
      },
      databaseStats: {
        companies: companyCount,
        kommuner: kommuneCount,
        addressHistory: addressHistoryCount,
      },
      systemHealth:
        companyCount > 50000
          ? "excellent"
          : companyCount > 10000
            ? "good"
            : "limited",
    };
  }

  // Helper methods
  private calculateDataQuality(
    companyCount: number,
    postalCodeCount: number
  ): string {
    if (companyCount > 1000 && postalCodeCount > 10) return "excellent";
    if (companyCount > 100 && postalCodeCount > 5) return "good";
    if (companyCount > 10) return "fair";
    return "limited";
  }

  private areAddressesIdentical(addr1: any, addr2: any): boolean {
    return (
      addr1.address === addr2.address &&
      addr1.postalCode === addr2.postalCode &&
      addr1.city === addr2.city &&
      addr1.kommuneNumber === addr2.kommuneNumber
    );
  }

  // Clear cache when needed
  clearCache(pattern?: string): void {
    if (pattern) {
      for (const key of Array.from(cache.keys())) {
        if (key.includes(pattern)) {
          cache.delete(key);
        }
      }
    } else {
      cache.clear();
    }
  }
}

export const performanceService = new PerformanceOptimizedService();
