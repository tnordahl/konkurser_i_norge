/**
 * Standardized Risk Assessment Configuration
 *
 * This file centralizes all risk scoring thresholds and criteria
 * to ensure consistency across the entire fraud detection system.
 */

// Risk Score Thresholds (0-100 scale)
export const RISK_THRESHOLDS = {
  LOW: 0,
  MEDIUM: 40,
  HIGH: 70,
  CRITICAL: 85,
} as const;

// Risk Level Type
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

// Company Risk Scoring Factors
export const RISK_FACTORS = {
  // Industry risk points
  HIGH_RISK_INDUSTRY: 30,
  MEDIUM_RISK_INDUSTRY: 15,

  // Address patterns
  ADDRESS_MISMATCH: 20,
  RECENT_ADDRESS_CHANGE: 25,
  CROSS_KOMMUNE_MOVE: 15,

  // Company lifecycle
  RECENT_REGISTRATION: 15,
  SHORT_LIFESPAN: 35,
  VERY_SHORT_LIFESPAN: 50, // Less than 6 months

  // Professional network indicators
  CROSS_KOMMUNE_SERVICES: 20,
  LAWYER_BOARD_CONTROL: 40,
  SUSPICIOUS_SERVICE_NETWORK: 25,

  // Bankruptcy indicators
  BANKRUPTCY_ENTITY: 100, // KBO companies
  NEAR_BANKRUPTCY: 80,

  // Shell company indicators
  SHELL_COMPANY_PATTERN: 60,
  PHOENIX_COMPANY_PATTERN: 70,
} as const;

// Data Coverage Thresholds
export const DATA_COVERAGE_THRESHOLDS = {
  EXCELLENT: 95,
  GOOD: 80,
  ACCEPTABLE: 60,
  POOR: 40,
  CRITICAL: 20,
} as const;

// Investigation Priority Scoring (1-10 scale)
export const INVESTIGATION_PRIORITY = {
  ROUTINE: 1,
  STANDARD: 3,
  ELEVATED: 5,
  HIGH: 7,
  URGENT: 9,
  IMMEDIATE: 10,
} as const;

// Helper Functions
export function getRiskLevel(score: number): RiskLevel {
  if (score >= RISK_THRESHOLDS.CRITICAL) return "CRITICAL";
  if (score >= RISK_THRESHOLDS.HIGH) return "HIGH";
  if (score >= RISK_THRESHOLDS.MEDIUM) return "MEDIUM";
  return "LOW";
}

export function getInvestigationPriority(
  riskLevel: RiskLevel,
  additionalFactors: number = 0
): number {
  let priority = INVESTIGATION_PRIORITY.ROUTINE;

  switch (riskLevel) {
    case "CRITICAL":
      priority = INVESTIGATION_PRIORITY.IMMEDIATE;
      break;
    case "HIGH":
      priority = INVESTIGATION_PRIORITY.URGENT;
      break;
    case "MEDIUM":
      priority = INVESTIGATION_PRIORITY.ELEVATED;
      break;
    case "LOW":
      priority = INVESTIGATION_PRIORITY.STANDARD;
      break;
  }

  return Math.min(
    priority + additionalFactors,
    INVESTIGATION_PRIORITY.IMMEDIATE
  );
}

export function getDataCoverageLevel(percentage: number): string {
  if (percentage >= DATA_COVERAGE_THRESHOLDS.EXCELLENT) return "EXCELLENT";
  if (percentage >= DATA_COVERAGE_THRESHOLDS.GOOD) return "GOOD";
  if (percentage >= DATA_COVERAGE_THRESHOLDS.ACCEPTABLE) return "ACCEPTABLE";
  if (percentage >= DATA_COVERAGE_THRESHOLDS.POOR) return "POOR";
  return "CRITICAL";
}

// High-risk industry codes (Norwegian NACE codes)
export const HIGH_RISK_INDUSTRIES = [
  "55.100", // Hotels and similar accommodation
  "56.101", // Licensed restaurants
  "43.110", // Demolition
  "68.100", // Buying and selling of own real estate
  "70.220", // Business and other management consultancy activities
  "41.200", // Construction of residential and non-residential buildings
  "43.390", // Other specialized construction activities
] as const;

export const MEDIUM_RISK_INDUSTRIES = [
  "47.110", // Retail sale in non-specialized stores
  "47.190", // Other retail sale in non-specialized stores
  "56.210", // Event catering activities
  "68.200", // Renting and operating of own or leased real estate
] as const;
