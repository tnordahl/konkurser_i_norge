/**
 * Fullmakttjenesten Integration
 *
 * Based on official API documentation:
 * https://data.brreg.no/fullmakt/docs/index.html
 *
 * Provides services to determine signing authority for Norwegian businesses
 */

export interface SigningAuthority {
  organizationNumber: string;
  companyName: string;
  signingRoles: SigningRole[];
  prokuraRoles: ProkuraRole[];
  lastUpdated: Date;
}

export interface SigningRole {
  roleType: string; // DAGL, LEDE, NEST, MEDL, etc.
  personId?: string; // May be available with proper authentication
  birthDate?: string; // Available in some variants
  name?: string;
  canSignAlone: boolean;
  canSignTogether: boolean;
}

export interface ProkuraRole {
  roleType: string; // PROK, POFE, POHV
  personId?: string;
  birthDate?: string;
  name?: string;
  canSignAlone: boolean;
  canSignTogether: boolean;
}

export interface AuthorityCheckRequest {
  organizationNumber: string;
  authorityType: "signatur" | "prokura";
  personIds: string[]; // Birth numbers for verification
}

export interface AuthorityCheckResult {
  organizationNumber: string;
  authorityType: "signatur" | "prokura";
  canSign: boolean;
  signingCombinations: string[];
  verificationDetails: {
    personsChecked: number;
    validSigners: number;
    invalidSigners: number;
  };
}

export class FullmaktService {
  private static instance: FullmaktService;
  private baseUrl = "https://data.brreg.no/fullmakt";
  private vcertBaseUrl = "https://data.vcert.brreg.no/fullmakt"; // Requires authentication

  static getInstance(): FullmaktService {
    if (!FullmaktService.instance) {
      FullmaktService.instance = new FullmaktService();
    }
    return FullmaktService.instance;
  }

  /**
   * Lookup signing authorities for a company (public version)
   * Returns birth dates instead of full personal info
   */
  async lookupSigningAuthority(
    organizationNumber: string
  ): Promise<SigningAuthority | null> {
    try {
      console.log(`🔍 Looking up signing authority for ${organizationNumber}`);

      // Try signatur first
      const signaturData = await this.fetchAuthorityData(
        organizationNumber,
        "signatur"
      );

      // Then prokura
      const prokuraData = await this.fetchAuthorityData(
        organizationNumber,
        "prokura"
      );

      if (!signaturData && !prokuraData) {
        return null;
      }

      return {
        organizationNumber,
        companyName:
          signaturData?.virksomhet?.navn ||
          prokuraData?.virksomhet?.navn ||
          "Unknown",
        signingRoles: this.parseSigningRoles(signaturData),
        prokuraRoles: this.parseProkuraRoles(prokuraData),
        lastUpdated: new Date(),
      };
    } catch (error) {
      console.error(
        `❌ Failed to lookup signing authority for ${organizationNumber}:`,
        error
      );
      return null;
    }
  }

  /**
   * Check if specific persons can sign for a company (requires authentication)
   * This would need X.509 business certificates in production
   */
  async checkSigningAuthority(
    request: AuthorityCheckRequest
  ): Promise<AuthorityCheckResult | null> {
    try {
      console.log(
        `🔐 Checking signing authority for ${request.organizationNumber} (${request.authorityType})`
      );

      // This endpoint requires authentication with business certificates
      // For now, return a mock response indicating the feature is available
      console.log(
        "⚠️ Authority checking requires X.509 business certificate authentication"
      );

      return {
        organizationNumber: request.organizationNumber,
        authorityType: request.authorityType,
        canSign: false, // Would be determined by actual API call
        signingCombinations: [],
        verificationDetails: {
          personsChecked: request.personIds.length,
          validSigners: 0,
          invalidSigners: 0,
        },
      };
    } catch (error) {
      console.error(`❌ Failed to check signing authority:`, error);
      return null;
    }
  }

  /**
   * Fetch authority data from public API
   */
  private async fetchAuthorityData(
    organizationNumber: string,
    authorityType: "signatur" | "prokura"
  ): Promise<any> {
    const url = `${this.baseUrl}/enheter/${organizationNumber}/${authorityType}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept:
          "application/vnd.brreg.enhetsregisteret.fullmakt.oppslag.v1+json;charset=UTF-8",
        "User-Agent": "konkurser-i-norge-fullmakt/1.0",
      },
    });

    if (response.status === 404) {
      // No authority data found - this is normal
      return null;
    }

    if (!response.ok) {
      throw new Error(
        `Fullmakt API error: ${response.status} ${response.statusText}`
      );
    }

    return await response.json();
  }

  /**
   * Parse signing roles from API response
   */
  private parseSigningRoles(data: any): SigningRole[] {
    if (!data?.muligeSigneringsroller) return [];

    return data.muligeSigneringsroller.map((role: any) => ({
      roleType: role.rolletype,
      birthDate: role.fodselsdato, // Available in public API
      name: role.navn,
      canSignAlone: role.kanSignereAlene || false,
      canSignTogether: role.kanSignereSammen || false,
    }));
  }

  /**
   * Parse prokura roles from API response
   */
  private parseProkuraRoles(data: any): ProkuraRole[] {
    if (!data?.muligeSigneringsroller) return [];

    return data.muligeSigneringsroller
      .filter((role: any) => role.rolletype?.startsWith("PO"))
      .map((role: any) => ({
        roleType: role.rolletype,
        birthDate: role.fodselsdato,
        name: role.navn,
        canSignAlone: role.kanSignereAlene || false,
        canSignTogether: role.kanSignereSammen || false,
      }));
  }

  /**
   * Get statistics about signing authorities in a kommune
   */
  async getKommuneAuthorityStats(kommuneNumber: string): Promise<{
    totalCompanies: number;
    companiesWithSignatur: number;
    companiesWithProkura: number;
    avgSignersPerCompany: number;
  }> {
    // This would require iterating through companies in the kommune
    // and checking their signing authorities
    console.log(`📊 Getting authority stats for kommune ${kommuneNumber}`);

    // TODO: Implement this by:
    // 1. Get all companies in kommune from our database
    // 2. Check signing authority for each
    // 3. Aggregate statistics

    return {
      totalCompanies: 0,
      companiesWithSignatur: 0,
      companiesWithProkura: 0,
      avgSignersPerCompany: 0,
    };
  }

  /**
   * Enhanced fraud detection using signing authority data
   */
  async detectSigningAuthorityFraud(organizationNumber: string): Promise<{
    riskScore: number;
    riskFactors: string[];
    recommendations: string[];
  }> {
    const authority = await this.lookupSigningAuthority(organizationNumber);

    if (!authority) {
      return {
        riskScore: 30,
        riskFactors: ["No signing authority data available"],
        recommendations: ["Verify company registration status"],
      };
    }

    const riskFactors: string[] = [];
    let riskScore = 0;

    // Check for unusual signing patterns
    if (
      authority.signingRoles.length === 0 &&
      authority.prokuraRoles.length === 0
    ) {
      riskFactors.push("No registered signing authorities");
      riskScore += 40;
    }

    // Check for excessive number of signers (possible nominee structure)
    const totalSigners =
      authority.signingRoles.length + authority.prokuraRoles.length;
    if (totalSigners > 10) {
      riskFactors.push(`Unusually high number of signers (${totalSigners})`);
      riskScore += 25;
    }

    // Check for prokura-only companies (higher risk)
    if (
      authority.signingRoles.length === 0 &&
      authority.prokuraRoles.length > 0
    ) {
      riskFactors.push("Company only has prokura, no signatur");
      riskScore += 20;
    }

    const recommendations: string[] = [];
    if (riskScore > 50) {
      recommendations.push("🚨 High-risk signing structure detected");
      recommendations.push("📋 Verify actual business operations");
      recommendations.push("🔍 Cross-check with address changes");
    }

    return {
      riskScore: Math.min(riskScore, 100),
      riskFactors,
      recommendations,
    };
  }
}

export const fullmaktService = FullmaktService.getInstance();
