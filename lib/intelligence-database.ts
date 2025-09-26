/**
 * Comprehensive Intelligence Database System
 *
 * This system stores and connects:
 * - All companies in a kommune
 * - Address changes over time
 * - Board member changes
 * - Professional service networks
 * - Bankruptcy tracking across kommuner
 * - Connection mapping between entities
 */

import { PrismaClient } from "@prisma/client";

// We'll extend the existing Prisma schema with intelligence tables
const prisma = new PrismaClient();

export interface CompanyIntelligence {
  organizationNumber: string;
  name: string;
  currentAddress: {
    address: string;
    kommuneNumber: string;
    kommuneName: string;
    postalCode: string;
  };
  addressHistory: AddressChange[];
  boardMembers: BoardMember[];
  professionalServices: ProfessionalService[];
  businessConnections: BusinessConnection[];
  riskAssessment: RiskAssessment;
  lastUpdated: Date;
}

export interface AddressChange {
  id: string;
  organizationNumber: string;
  fromAddress: string;
  toAddress: string;
  fromKommune: string;
  toKommune: string;
  changeDate: Date;
  detectedDate: Date;
  changeReason?: string;
  suspiciousIndicators: string[];
}

export interface BoardMember {
  id: string;
  organizationNumber: string;
  name: string;
  birthYear: number;
  role: string;
  startDate?: Date;
  endDate?: Date;
  isProfessional: boolean; // lawyer, accountant, etc.
  profession?: string;
  otherCompanies: string[]; // other companies they're involved with
}

export interface ProfessionalService {
  id: string;
  clientOrgNumber: string;
  serviceType: "ACCOUNTANT" | "AUDITOR" | "LAWYER" | "CONSULTANT";
  providerName: string;
  providerOrgNumber?: string;
  providerAddress: string;
  providerKommune: string;
  startDate?: Date;
  endDate?: Date;
  isActive: boolean;
}

export interface BusinessConnection {
  id: string;
  fromOrgNumber: string;
  toOrgNumber: string;
  connectionType:
    | "SHARED_BOARD_MEMBER"
    | "SHARED_SERVICE"
    | "SHARED_ADDRESS"
    | "OWNERSHIP"
    | "SUBSIDIARY";
  strength: "WEAK" | "MEDIUM" | "STRONG";
  details: string;
  detectedDate: Date;
}

export interface RiskAssessment {
  organizationNumber: string;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  riskFactors: string[];
  fraudIndicators: string[];
  lastAssessment: Date;
  investigationPriority: number; // 1-10
}

/**
 * Comprehensive Kommune Intelligence Scan
 * Gets ALL data for a kommune and stores in database
 */
export async function performKommuneIntelligenceScan(
  kommuneNumber: string
): Promise<{
  totalCompanies: number;
  addressChanges: number;
  suspiciousPatterns: number;
  newInvestigations: number;
}> {
  console.log(
    `🕵️‍♂️ STARTING COMPREHENSIVE INTELLIGENCE SCAN: Kommune ${kommuneNumber}`
  );

  // Step 1: Get all companies currently in the kommune
  const currentCompanies = await fetchAllKommuneCompanies(kommuneNumber);
  console.log(
    `📊 Found ${currentCompanies.length} companies currently in kommune`
  );

  // Step 2: Get all companies that USED to be in the kommune (via professional services)
  const escapedCompanies = await findEscapedCompanies(kommuneNumber);
  console.log(
    `🏃‍♂️ Found ${escapedCompanies.length} companies that escaped from kommune`
  );

  // Step 3: Analyze address changes and track bankruptcy outcomes
  let totalAddressChanges = 0;
  let suspiciousPatterns = 0;
  let newInvestigations = 0;

  const allCompanies = [...currentCompanies, ...escapedCompanies];

  for (const company of allCompanies) {
    // Deep investigation of each company
    const intelligence = await performDeepCompanyInvestigation(
      company.organizationNumber
    );

    // Store in database
    await storeCompanyIntelligence(intelligence);

    // Count metrics
    totalAddressChanges += intelligence.addressHistory.length;
    if (
      intelligence.riskAssessment.riskLevel === "HIGH" ||
      intelligence.riskAssessment.riskLevel === "CRITICAL"
    ) {
      suspiciousPatterns++;
    }
    if (intelligence.riskAssessment.investigationPriority >= 8) {
      newInvestigations++;
    }

    // If we find address changes, trigger deeper investigation
    if (intelligence.addressHistory.length > 0) {
      await triggerDeepInvestigation(
        company.organizationNumber,
        intelligence.addressHistory
      );
    }

    // Small delay to avoid overwhelming API
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  console.log(
    `✅ INTELLIGENCE SCAN COMPLETE: ${allCompanies.length} companies analyzed`
  );

  return {
    totalCompanies: allCompanies.length,
    addressChanges: totalAddressChanges,
    suspiciousPatterns,
    newInvestigations,
  };
}

/**
 * Fetch all companies currently registered in a kommune
 */
async function fetchAllKommuneCompanies(kommuneNumber: string): Promise<any[]> {
  const companies = [];
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    try {
      const response = await fetch(
        `https://data.brreg.no/enhetsregisteret/api/enheter?kommunenummer=${kommuneNumber}&size=1000&page=${page}`,
        {
          headers: {
            Accept: "application/json",
            "User-Agent": "konkurser-i-norge-intelligence/1.0",
          },
        }
      );

      if (!response.ok) break;

      const data = await response.json();

      if (data._embedded?.enheter) {
        companies.push(...data._embedded.enheter);
        page++;

        // Check if there are more pages
        hasMore = data.page && data.page.number < data.page.totalPages - 1;
      } else {
        hasMore = false;
      }

      await new Promise((resolve) => setTimeout(resolve, 200)); // Rate limiting
    } catch (error) {
      console.error(`Error fetching page ${page}:`, error);
      hasMore = false;
    }
  }

  return companies;
}

/**
 * Find companies that used to be in the kommune but moved out
 * by analyzing professional service networks
 */
async function findEscapedCompanies(kommuneNumber: string): Promise<any[]> {
  // This is complex - we need to:
  // 1. Find all professional services (accountants, lawyers) in the kommune
  // 2. For each service, find their clients nationwide
  // 3. Flag clients that are outside the kommune but use services inside

  const escapedCompanies: any[] = [];

  // Generic escaped company discovery - no hardcoded cases
  // TODO: Implement dynamic discovery based on:
  // 1. Professional service networks across kommuner
  // 2. Address change patterns analysis
  // 3. Cross-kommune business relationships
  console.log(
    `🔍 Dynamic escaped company discovery for kommune ${kommuneNumber} - not yet implemented`
  );

  return escapedCompanies;
}

/**
 * Perform deep investigation of a single company
 */
async function performDeepCompanyInvestigation(
  organizationNumber: string
): Promise<CompanyIntelligence> {
  console.log(`🔍 Deep investigating: ${organizationNumber}`);

  // Fetch detailed company data
  const response = await fetch(
    `https://data.brreg.no/enhetsregisteret/api/enheter/${organizationNumber}`,
    {
      headers: {
        Accept: "application/json",
        "User-Agent": "konkurser-i-norge-intelligence/1.0",
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch company data for ${organizationNumber}`);
  }

  const companyData = await response.json();

  // Analyze address history (simplified for now)
  const addressHistory = await analyzeAddressHistory(companyData);

  // Analyze board members (would require additional API calls in real system)
  const boardMembers = await analyzeBoardMembers(organizationNumber);

  // Analyze professional services
  const professionalServices =
    await analyzeProfessionalServices(organizationNumber);

  // Perform risk assessment
  const riskAssessment = performRiskAssessment(
    companyData,
    addressHistory,
    boardMembers,
    professionalServices
  );

  return {
    organizationNumber,
    name: companyData.navn,
    currentAddress: {
      address: formatAddress(companyData.forretningsadresse),
      kommuneNumber: companyData.forretningsadresse?.kommunenummer || "",
      kommuneName: companyData.forretningsadresse?.poststed || "",
      postalCode: companyData.forretningsadresse?.postnummer || "",
    },
    addressHistory,
    boardMembers,
    professionalServices,
    businessConnections: [], // Would be populated by connection analysis
    riskAssessment,
    lastUpdated: new Date(),
  };
}

async function analyzeAddressHistory(
  companyData: any
): Promise<AddressChange[]> {
  // In a real system, this would track historical changes
  // For now, we detect potential changes based on business vs postal address differences

  const changes: AddressChange[] = [];

  const businessAddr = companyData.forretningsadresse;
  const postAddr = companyData.postadresse;

  if (businessAddr && postAddr) {
    const businessKommune = businessAddr.kommunenummer;
    const postKommune = postAddr.kommunenummer;

    if (businessKommune !== postKommune) {
      changes.push({
        id: `${companyData.organisasjonsnummer}-addr-change-1`,
        organizationNumber: companyData.organisasjonsnummer,
        fromAddress: formatAddress(postAddr),
        toAddress: formatAddress(businessAddr),
        fromKommune: postKommune,
        toKommune: businessKommune,
        changeDate: new Date(
          companyData.registreringsdatoEnhetsregisteret || new Date()
        ),
        detectedDate: new Date(),
        suspiciousIndicators: ["CROSS_KOMMUNE_ADDRESSES"],
      });
    }
  }

  return changes;
}

async function analyzeBoardMembers(
  organizationNumber: string
): Promise<BoardMember[]> {
  // In a real system, this would fetch from roles API or other sources
  // For known cases, we'll populate manually

  const boardMembers: BoardMember[] = [];

  // Generic board member analysis - no hardcoded cases
  // TODO: Implement dynamic board member discovery from:
  // 1. Brønnøysundregistrene API
  // 2. Professional service network analysis
  // 3. Cross-reference with lawyer/accountant databases
  console.log(
    `🔍 Dynamic board member analysis for ${organizationNumber} - not yet implemented`
  );

  return boardMembers;
}

async function analyzeProfessionalServices(
  organizationNumber: string
): Promise<ProfessionalService[]> {
  const services: ProfessionalService[] = [];

  // Generic professional service analysis - no hardcoded cases
  // TODO: Implement dynamic service discovery from:
  // 1. Professional service provider APIs
  // 2. Cross-kommune service pattern analysis
  // 3. Address mismatch detection between client and service provider
  console.log(
    `🔍 Dynamic professional service analysis for ${organizationNumber} - not yet implemented`
  );

  return services;
}

function performRiskAssessment(
  companyData: any,
  addressHistory: AddressChange[],
  boardMembers: BoardMember[],
  professionalServices: ProfessionalService[]
): RiskAssessment {
  const riskFactors: string[] = [];
  const fraudIndicators: string[] = [];
  let riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" = "LOW";
  let investigationPriority = 1;

  // Address change analysis
  if (addressHistory.length > 0) {
    riskFactors.push("HAS_ADDRESS_CHANGES");
    investigationPriority += 2;

    const crossKommuneChanges = addressHistory.filter(
      (change) => change.fromKommune !== change.toKommune
    );

    if (crossKommuneChanges.length > 0) {
      fraudIndicators.push("CROSS_KOMMUNE_MIGRATION");
      riskLevel = "MEDIUM";
      investigationPriority += 3;
    }
  }

  // Board member analysis
  const lawyerBoardMembers = boardMembers.filter(
    (member) => member.isProfessional && member.profession === "LAWYER"
  );

  if (lawyerBoardMembers.length > 0) {
    fraudIndicators.push("LAWYER_BOARD_CONTROL");
    riskLevel = "HIGH";
    investigationPriority += 4;
  }

  // Professional service network analysis
  const crossKommuneServices = professionalServices.filter(
    (service) =>
      service.providerKommune !== companyData.forretningsadresse?.kommunenummer
  );

  if (crossKommuneServices.length > 0) {
    riskFactors.push("CROSS_KOMMUNE_PROFESSIONAL_SERVICES");
    investigationPriority += 2;

    if (riskLevel === "LOW") riskLevel = "MEDIUM";
  }

  // Generic risk escalation based on multiple factors
  if (fraudIndicators.length >= 2 && riskFactors.length >= 3) {
    riskLevel = "CRITICAL";
    investigationPriority = 10;
  }

  return {
    organizationNumber: companyData.organisasjonsnummer,
    riskLevel,
    riskFactors,
    fraudIndicators,
    lastAssessment: new Date(),
    investigationPriority,
  };
}

/**
 * Store company intelligence in database
 */
async function storeCompanyIntelligence(
  intelligence: CompanyIntelligence
): Promise<void> {
  // In a real system, this would store in proper database tables
  // For now, we'll log the intelligence data
  console.log(
    `📊 Storing intelligence for ${intelligence.name} (${intelligence.organizationNumber})`
  );
  console.log(`   Risk Level: ${intelligence.riskAssessment.riskLevel}`);
  console.log(`   Address Changes: ${intelligence.addressHistory.length}`);
  console.log(
    `   Professional Services: ${intelligence.professionalServices.length}`
  );
  console.log(
    `   Investigation Priority: ${intelligence.riskAssessment.investigationPriority}/10`
  );
}

/**
 * Trigger deep investigation when suspicious patterns are found
 */
async function triggerDeepInvestigation(
  organizationNumber: string,
  addressHistory: AddressChange[]
): Promise<void> {
  console.log(`🚨 TRIGGERING DEEP INVESTIGATION: ${organizationNumber}`);

  for (const change of addressHistory) {
    // Check if company went bankrupt after moving to the new kommune
    await checkBankruptcyInDestinationKommune(
      organizationNumber,
      change.toKommune
    );

    // Investigate board member changes around the time of address change
    await investigateBoardChangesAroundDate(
      organizationNumber,
      change.changeDate
    );
  }
}

async function checkBankruptcyInDestinationKommune(
  organizationNumber: string,
  destinationKommune: string
): Promise<void> {
  console.log(
    `🔍 Checking if ${organizationNumber} went bankrupt in kommune ${destinationKommune}`
  );
  // Implementation would check bankruptcy records in the destination kommune
}

async function investigateBoardChangesAroundDate(
  organizationNumber: string,
  changeDate: Date
): Promise<void> {
  console.log(
    `🔍 Investigating board changes for ${organizationNumber} around ${changeDate.toISOString()}`
  );
  // Implementation would check for board member changes before/after address change
}

function formatAddress(addr: any): string {
  if (!addr) return "";
  const parts = [];
  if (addr.adresse?.length) parts.push(addr.adresse.join(" "));
  if (addr.postnummer) parts.push(addr.postnummer);
  if (addr.poststed) parts.push(addr.poststed);
  return parts.join(", ");
}

export { performDeepCompanyInvestigation, storeCompanyIntelligence };
