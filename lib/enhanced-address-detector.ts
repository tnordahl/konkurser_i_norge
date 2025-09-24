/**
 * Enhanced Address Change Detector
 * 
 * Uses postal code mapping and comprehensive address analysis
 * to accurately detect address changes and kommune movements
 */

import { prisma } from "./database";
import { postalCodeService } from "./postal-code-service";

export interface AddressChangeResult {
  hasChanged: boolean;
  changeType: "WITHIN_KOMMUNE" | "BETWEEN_KOMMUNER" | "NO_CHANGE";
  fromKommune?: string;
  toKommune?: string;
  fromAddress?: string;
  toAddress?: string;
  fromPostalCode?: string;
  toPostalCode?: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  details: string[];
}

export interface CompanyAddressInfo {
  organizationNumber: string;
  name: string;
  currentBusinessAddress?: any;
  currentPostalAddress?: any;
  previousBusinessAddress?: any;
  previousPostalAddress?: any;
  registrationDate?: Date;
}

export class EnhancedAddressDetector {
  private static instance: EnhancedAddressDetector;

  static getInstance(): EnhancedAddressDetector {
    if (!EnhancedAddressDetector.instance) {
      EnhancedAddressDetector.instance = new EnhancedAddressDetector();
    }
    return EnhancedAddressDetector.instance;
  }

  /**
   * Analyze address changes for a company using postal code mapping
   */
  async analyzeAddressChange(companyInfo: CompanyAddressInfo): Promise<AddressChangeResult> {
    const details: string[] = [];
    
    try {
      // Extract current addresses
      const currentBusiness = this.extractAddressInfo(companyInfo.currentBusinessAddress);
      const currentPostal = this.extractAddressInfo(companyInfo.currentPostalAddress);
      
      // Extract previous addresses from database
      const previousAddresses = await this.getPreviousAddresses(companyInfo.organizationNumber);
      
      if (previousAddresses.length === 0) {
        details.push("No previous address history found");
        return {
          hasChanged: false,
          changeType: "NO_CHANGE",
          confidence: "HIGH",
          details,
        };
      }

      // Compare with most recent previous address
      const mostRecent = previousAddresses[0];
      const previousInfo = {
        address: mostRecent.address,
        postalCode: mostRecent.postalCode,
        city: mostRecent.city,
        kommuneNumber: mostRecent.kommuneNumber,
      };

      // Analyze business address changes
      const businessChange = await this.compareAddresses(
        previousInfo,
        currentBusiness,
        "business"
      );

      // Analyze postal address changes (if different from business)
      let postalChange: AddressChangeResult | null = null;
      if (currentPostal && this.isDifferentAddress(currentBusiness, currentPostal)) {
        postalChange = await this.compareAddresses(
          previousInfo,
          currentPostal,
          "postal"
        );
      }

      // Determine overall result
      const primaryChange = businessChange.hasChanged ? businessChange : postalChange;
      
      if (!primaryChange || !primaryChange.hasChanged) {
        details.push("No significant address changes detected");
        return {
          hasChanged: false,
          changeType: "NO_CHANGE",
          confidence: "HIGH",
          details,
        };
      }

      details.push(...primaryChange.details);
      return primaryChange;

    } catch (error) {
      console.error(`❌ Failed to analyze address change for ${companyInfo.organizationNumber}:`, error);
      details.push(`Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      return {
        hasChanged: false,
        changeType: "NO_CHANGE",
        confidence: "LOW",
        details,
      };
    }
  }

  /**
   * Compare two addresses and determine change type
   */
  private async compareAddresses(
    previous: any,
    current: any,
    addressType: "business" | "postal"
  ): Promise<AddressChangeResult> {
    const details: string[] = [];
    
    if (!current) {
      details.push(`No current ${addressType} address found`);
      return {
        hasChanged: false,
        changeType: "NO_CHANGE",
        confidence: "HIGH",
        details,
      };
    }

    // Check if addresses are identical
    if (this.areAddressesIdentical(previous, current)) {
      details.push(`${addressType} address unchanged`);
      return {
        hasChanged: false,
        changeType: "NO_CHANGE",
        confidence: "HIGH",
        details,
      };
    }

    // Determine kommune changes using postal codes
    const fromKommune = previous.kommuneNumber || 
      await postalCodeService.findKommuneForPostalCode(previous.postalCode);
    const toKommune = current.kommuneNumber || 
      await postalCodeService.findKommuneForPostalCode(current.postalCode);

    let changeType: "WITHIN_KOMMUNE" | "BETWEEN_KOMMUNER" = "WITHIN_KOMMUNE";
    let confidence: "HIGH" | "MEDIUM" | "LOW" = "MEDIUM";

    if (fromKommune && toKommune) {
      if (fromKommune !== toKommune) {
        changeType = "BETWEEN_KOMMUNER";
        confidence = "HIGH";
        details.push(`Kommune change detected: ${fromKommune} → ${toKommune}`);
      } else {
        changeType = "WITHIN_KOMMUNE";
        confidence = "HIGH";
        details.push(`Address change within kommune ${fromKommune}`);
      }
    } else {
      // Fallback to postal code analysis
      if (previous.postalCode !== current.postalCode) {
        changeType = "BETWEEN_KOMMUNER"; // Assume different postal codes = different kommuner
        confidence = "MEDIUM";
        details.push(`Postal code change: ${previous.postalCode} → ${current.postalCode}`);
      } else {
        changeType = "WITHIN_KOMMUNE";
        confidence = "LOW";
        details.push("Address change detected but kommune unclear");
      }
    }

    details.push(`${addressType} address: ${previous.address} → ${current.address}`);

    return {
      hasChanged: true,
      changeType,
      fromKommune,
      toKommune,
      fromAddress: previous.address,
      toAddress: current.address,
      fromPostalCode: previous.postalCode,
      toPostalCode: current.postalCode,
      confidence,
      details,
    };
  }

  /**
   * Extract standardized address info from API response
   */
  private extractAddressInfo(addressObj: any): any {
    if (!addressObj) return null;

    return {
      address: this.formatAddress(addressObj),
      postalCode: addressObj.postnummer,
      city: addressObj.poststed,
      kommuneNumber: addressObj.kommunenummer,
    };
  }

  /**
   * Format address for comparison
   */
  private formatAddress(addressObj: any): string {
    if (!addressObj) return "";

    const parts = [
      addressObj.adresse?.[0],
      addressObj.postnummer,
      addressObj.poststed,
    ].filter(Boolean);

    return parts.join(", ");
  }

  /**
   * Check if two addresses are identical
   */
  private areAddressesIdentical(addr1: any, addr2: any): boolean {
    return (
      addr1.address === addr2.address &&
      addr1.postalCode === addr2.postalCode &&
      addr1.city === addr2.city
    );
  }

  /**
   * Check if two addresses are different
   */
  private isDifferentAddress(addr1: any, addr2: any): boolean {
    if (!addr1 || !addr2) return false;
    return !this.areAddressesIdentical(addr1, addr2);
  }

  /**
   * Get previous addresses from database
   */
  private async getPreviousAddresses(organizationNumber: string): Promise<any[]> {
    return await prisma.companyAddressHistory.findMany({
      where: {
        organizationNumber,
        isCurrentAddress: false, // Get historical addresses
      },
      orderBy: {
        toDate: 'desc', // Most recent first
      },
      take: 5, // Limit to recent history
    });
  }

  /**
   * Detect companies that have moved between kommuner
   */
  async findKommuneMovers(
    fromKommuneNumber: string,
    toKommuneNumber?: string,
    daysBack: number = 30
  ): Promise<{
    organizationNumber: string;
    name: string;
    fromAddress: string;
    toAddress: string;
    changeDate: Date;
    confidence: string;
  }[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);

    // Find companies with address history showing movement
    const movers = await prisma.companyAddressHistory.findMany({
      where: {
        kommuneNumber: fromKommuneNumber,
        toDate: {
          gte: cutoffDate,
        },
        isCurrentAddress: false,
      },
      include: {
        company: {
          select: {
            organizationNumber: true,
            name: true,
            currentAddress: true,
            currentPostalCode: true,
            addressHistory: {
              where: {
                isCurrentAddress: true,
              },
              take: 1,
            },
          },
        },
      },
    });

    const results = [];

    for (const mover of movers) {
      const currentAddress = mover.company.addressHistory[0];
      
      // Check if they moved to the target kommune (if specified)
      if (toKommuneNumber && currentAddress?.kommuneNumber !== toKommuneNumber) {
        continue;
      }

      // Verify they actually moved (not just updated same address)
      if (currentAddress && currentAddress.address !== mover.address) {
        results.push({
          organizationNumber: mover.organizationNumber,
          name: mover.company.name,
          fromAddress: mover.address,
          toAddress: currentAddress.address,
          changeDate: mover.toDate || new Date(),
          confidence: currentAddress.kommuneNumber ? "HIGH" : "MEDIUM",
        });
      }
    }

    return results;
  }

  /**
   * Get comprehensive address change statistics
   */
  async getAddressChangeStats(kommuneNumber?: string): Promise<{
    totalCompanies: number;
    companiesWithHistory: number;
    recentChanges: number;
    kommuneMovements: number;
    postalCodeCoverage: number;
  }> {
    const whereClause = kommuneNumber ? {
      OR: [
        { kommuneNumber },
        { company: { currentAddress: { contains: kommuneNumber } } },
      ],
    } : {};

    const totalCompanies = await prisma.company.count(
      kommuneNumber ? {
        where: {
          OR: [
            { businessAddress: { path: ["kommunenummer"], equals: kommuneNumber } },
            { postalAddress: { path: ["kommunenummer"], equals: kommuneNumber } },
          ],
        },
      } : {}
    );

    const companiesWithHistory = await prisma.company.count({
      where: {
        addressHistory: {
          some: {},
        },
        ...(kommuneNumber && {
          OR: [
            { businessAddress: { path: ["kommunenummer"], equals: kommuneNumber } },
            { postalAddress: { path: ["kommunenummer"], equals: kommuneNumber } },
          ],
        }),
      },
    });

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentChanges = await prisma.companyAddressHistory.count({
      where: {
        createdAt: { gte: thirtyDaysAgo },
        ...whereClause,
      },
    });

    const kommuneMovements = await prisma.companyAddressHistory.count({
      where: {
        toDate: { gte: thirtyDaysAgo },
        isCurrentAddress: false,
        ...whereClause,
      },
    });

    const postalCodeCoverage = kommuneNumber 
      ? await prisma.kommunePostalCode.count({
          where: { kommuneNumber, isActive: true },
        })
      : await prisma.kommunePostalCode.count({
          where: { isActive: true },
        });

    return {
      totalCompanies,
      companiesWithHistory,
      recentChanges,
      kommuneMovements,
      postalCodeCoverage,
    };
  }
}

export const enhancedAddressDetector = EnhancedAddressDetector.getInstance();
