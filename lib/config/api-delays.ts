/**
 * Standardized API Rate Limiting Configuration
 *
 * This file centralizes all API delay timings to ensure consistent
 * rate limiting across the entire system and prevent API abuse.
 */

// Standard API Delays (in milliseconds)
export const API_DELAYS = {
  // External API rate limiting
  BRONNØYSUND_API_DELAY: 200, // Between Brønnøysundregistrene API calls
  EXTERNAL_API_BATCH_DELAY: 1000, // Between batches of external API calls

  // Internal processing delays
  QUICK_PROCESSING_DELAY: 30, // Quick operations (address validation, etc.)
  STANDARD_PROCESSING_DELAY: 100, // Standard processing operations
  HEAVY_PROCESSING_DELAY: 500, // Heavy processing operations

  // Database operation delays
  DATABASE_BATCH_DELAY: 50, // Between database batch operations

  // Error recovery delays
  RETRY_DELAY_SHORT: 1000, // Short retry delay (1 second)
  RETRY_DELAY_MEDIUM: 5000, // Medium retry delay (5 seconds)
  RETRY_DELAY_LONG: 15000, // Long retry delay (15 seconds)
} as const;

// Batch Processing Configuration
export const BATCH_CONFIG = {
  COMPANY_BATCH_SIZE: 10, // Companies processed per batch
  API_BATCH_SIZE: 500, // API records per batch
  MAX_CONCURRENT_REQUESTS: 5, // Maximum concurrent API requests
} as const;

// Helper function to create standardized delays
export function createDelay(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

// Specific delay functions for common operations
export const delay = {
  // External API delays
  betweenBronnøysundCalls: () => createDelay(API_DELAYS.BRONNØYSUND_API_DELAY),
  betweenApiBatches: () => createDelay(API_DELAYS.EXTERNAL_API_BATCH_DELAY),

  // Processing delays
  quickProcessing: () => createDelay(API_DELAYS.QUICK_PROCESSING_DELAY),
  standardProcessing: () => createDelay(API_DELAYS.STANDARD_PROCESSING_DELAY),
  heavyProcessing: () => createDelay(API_DELAYS.HEAVY_PROCESSING_DELAY),

  // Database delays
  betweenDatabaseBatches: () => createDelay(API_DELAYS.DATABASE_BATCH_DELAY),

  // Retry delays
  shortRetry: () => createDelay(API_DELAYS.RETRY_DELAY_SHORT),
  mediumRetry: () => createDelay(API_DELAYS.RETRY_DELAY_MEDIUM),
  longRetry: () => createDelay(API_DELAYS.RETRY_DELAY_LONG),
};

// Rate limiting helper for external APIs
export class RateLimiter {
  private lastCallTime = 0;
  private readonly minInterval: number;

  constructor(minIntervalMs: number) {
    this.minInterval = minIntervalMs;
  }

  async waitForNextCall(): Promise<void> {
    const now = Date.now();
    const timeSinceLastCall = now - this.lastCallTime;

    if (timeSinceLastCall < this.minInterval) {
      const waitTime = this.minInterval - timeSinceLastCall;
      await createDelay(waitTime);
    }

    this.lastCallTime = Date.now();
  }
}

// Pre-configured rate limiters for common APIs
export const rateLimiters = {
  bronnøysund: new RateLimiter(API_DELAYS.BRONNØYSUND_API_DELAY),
  general: new RateLimiter(API_DELAYS.STANDARD_PROCESSING_DELAY),
};
