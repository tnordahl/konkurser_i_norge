/**
 * System-wide Constants Configuration
 *
 * This file centralizes all magic numbers and constants used throughout
 * the fraud detection system to improve maintainability and consistency.
 */

// API Pagination Constants
export const PAGINATION = {
  // Standard page sizes for different operations
  SMALL_PAGE_SIZE: 100,
  STANDARD_PAGE_SIZE: 500,
  LARGE_PAGE_SIZE: 1000,
  EXTRA_LARGE_PAGE_SIZE: 2000,

  // Maximum pages to scan (performance limits)
  MAX_PAGES_QUICK_SCAN: 2,
  MAX_PAGES_STANDARD_SCAN: 5,
  MAX_PAGES_DEEP_SCAN: 10,

  // Starting page (zero-indexed)
  FIRST_PAGE: 0,
} as const;

// Risk Assessment Thresholds
export const RISK_COUNTS = {
  // Company count thresholds for risk escalation
  HIGH_RISK_COMPANY_THRESHOLD: 3,
  MEDIUM_RISK_COMPANY_THRESHOLD: 5,
  MULTIPLE_COMPANIES_THRESHOLD: 3,

  // Investigation priority thresholds
  URGENT_INVESTIGATION_THRESHOLD: 3,
  STANDARD_INVESTIGATION_THRESHOLD: 1,
} as const;

// Data Quality Constants
export const DATA_QUALITY = {
  // Coverage percentage thresholds (complementing risk-thresholds.ts)
  MINIMUM_ACCEPTABLE_COVERAGE: 60,
  GOOD_COVERAGE_THRESHOLD: 80,
  EXCELLENT_COVERAGE_THRESHOLD: 95,

  // Data completeness requirements
  MIN_REQUIRED_FIELDS: 3,
  RECOMMENDED_FIELDS: 7,
  COMPLETE_RECORD_FIELDS: 10,
} as const;

// Address and Location Constants
export const LOCATION = {
  // Default values for missing data
  UNKNOWN_KOMMUNE_CODE: "0000",
  UNKNOWN_POSTAL_CODE: "0000",
  UNKNOWN_KOMMUNE_NAME: "Ukjent kommune",

  // Norwegian kommune number ranges
  MIN_KOMMUNE_NUMBER: 301, // Oslo
  MAX_KOMMUNE_NUMBER: 5655, // Highest valid kommune number

  // Postal code validation
  MIN_POSTAL_CODE: 1,
  MAX_POSTAL_CODE: 9999,
} as const;

// Business Logic Constants
export const BUSINESS_RULES = {
  // Shell company detection thresholds
  SHELL_COMPANY_MAX_DAYS: 365,
  VERY_SHORT_LIFESPAN_DAYS: 180,
  EXTREMELY_SHORT_LIFESPAN_DAYS: 90,

  // Professional network analysis
  MIN_CONNECTIONS_FOR_NETWORK: 2,
  SIGNIFICANT_NETWORK_SIZE: 5,
  LARGE_NETWORK_SIZE: 10,

  // Address change analysis
  RECENT_MOVE_DAYS: 180,
  SUSPICIOUS_MOVE_DAYS: 90,

  // Registration analysis
  NEW_COMPANY_THRESHOLD_DAYS: 365,
  RECENT_REGISTRATION_DAYS: 180,
} as const;

// System Performance Constants
export const PERFORMANCE = {
  // Batch processing sizes
  SMALL_BATCH_SIZE: 5,
  STANDARD_BATCH_SIZE: 10,
  LARGE_BATCH_SIZE: 25,

  // Concurrent operation limits
  MAX_CONCURRENT_API_CALLS: 5,
  MAX_CONCURRENT_DB_OPERATIONS: 10,

  // Cache and storage limits
  MAX_CACHE_ENTRIES: 1000,
  MAX_SEARCH_RESULTS: 100,
  MAX_EXPORT_RECORDS: 10000,
} as const;

// User Interface Constants
export const UI = {
  // Display limits
  MAX_ITEMS_PER_PAGE: 50,
  DEFAULT_ITEMS_PER_PAGE: 20,
  MAX_SEARCH_SUGGESTIONS: 10,

  // Table and list limits
  MAX_TABLE_ROWS: 100,
  MAX_DROPDOWN_ITEMS: 50,

  // Chart and visualization limits
  MAX_CHART_DATA_POINTS: 365,
  DEFAULT_CHART_PERIOD_DAYS: 90,
} as const;

// Validation Constants
export const VALIDATION = {
  // Organization number validation (Norwegian)
  ORG_NUMBER_LENGTH: 9,
  ORG_NUMBER_MIN: 100000000,
  ORG_NUMBER_MAX: 999999999,

  // Kommune number validation
  KOMMUNE_NUMBER_LENGTH: 4,

  // Text field limits
  MAX_COMPANY_NAME_LENGTH: 200,
  MAX_ADDRESS_LENGTH: 100,
  MAX_SEARCH_QUERY_LENGTH: 50,

  // Numeric limits
  MIN_RISK_SCORE: 0,
  MAX_RISK_SCORE: 100,
  MIN_INVESTIGATION_PRIORITY: 1,
  MAX_INVESTIGATION_PRIORITY: 10,
} as const;

// Time Period Constants
export const TIME_PERIODS = {
  // Standard analysis periods (in days)
  WEEK: 7,
  MONTH: 30,
  QUARTER: 90,
  HALF_YEAR: 180,
  YEAR: 365,

  // Extended periods
  TWO_YEARS: 730,
  FIVE_YEARS: 1825,

  // Short periods
  THREE_DAYS: 3,
  ONE_WEEK: 7,
  TWO_WEEKS: 14,
} as const;

// File and Export Constants
export const FILE_PROCESSING = {
  // File size limits (in bytes)
  MAX_UPLOAD_SIZE: 10 * 1024 * 1024, // 10MB
  MAX_EXPORT_SIZE: 50 * 1024 * 1024, // 50MB

  // File format limits
  MAX_CSV_ROWS: 100000,
  MAX_JSON_OBJECTS: 50000,

  // Processing batch sizes
  FILE_PROCESSING_BATCH_SIZE: 1000,
} as const;

// Error Handling Constants
export const ERROR_HANDLING = {
  // Retry attempts
  MAX_RETRY_ATTEMPTS: 3,
  MAX_API_RETRY_ATTEMPTS: 5,

  // Timeout values (in milliseconds)
  DEFAULT_TIMEOUT: 30000, // 30 seconds
  API_TIMEOUT: 60000, // 60 seconds
  LONG_OPERATION_TIMEOUT: 300000, // 5 minutes

  // Error threshold counts
  MAX_ERRORS_PER_BATCH: 10,
  MAX_CONSECUTIVE_ERRORS: 5,
} as const;

// Helper functions for common checks
export const checks = {
  isValidKommuneNumber: (num: string): boolean => {
    const n = parseInt(num);
    return n >= LOCATION.MIN_KOMMUNE_NUMBER && n <= LOCATION.MAX_KOMMUNE_NUMBER;
  },

  isValidOrganizationNumber: (orgNr: string): boolean => {
    return orgNr.length === VALIDATION.ORG_NUMBER_LENGTH && /^\d+$/.test(orgNr);
  },

  isHighRiskCount: (count: number): boolean => {
    return count >= RISK_COUNTS.HIGH_RISK_COMPANY_THRESHOLD;
  },

  isMediumRiskCount: (count: number): boolean => {
    return count >= RISK_COUNTS.MEDIUM_RISK_COMPANY_THRESHOLD;
  },

  isRecentActivity: (days: number): boolean => {
    return days <= BUSINESS_RULES.RECENT_MOVE_DAYS;
  },
};
