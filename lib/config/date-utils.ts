/**
 * Standardized Date Calculation Utilities
 * 
 * This file centralizes all date calculations to ensure consistency
 * across the entire system and prevent date-related bugs.
 */

// Standard date calculation functions
export const dateUtils = {
  /**
   * Get a date that is a specific number of years in the past
   */
  yearsAgo(years: number, fromDate: Date = new Date()): Date {
    const result = new Date(fromDate);
    result.setFullYear(result.getFullYear() - years);
    return result;
  },

  /**
   * Get a date that is a specific number of months in the past
   */
  monthsAgo(months: number, fromDate: Date = new Date()): Date {
    const result = new Date(fromDate);
    result.setMonth(result.getMonth() - months);
    return result;
  },

  /**
   * Get a date that is a specific number of days in the past
   */
  daysAgo(days: number, fromDate: Date = new Date()): Date {
    const result = new Date(fromDate);
    result.setDate(result.getDate() - days);
    return result;
  },

  /**
   * Get a date that is a specific number of years in the future
   */
  yearsFromNow(years: number, fromDate: Date = new Date()): Date {
    const result = new Date(fromDate);
    result.setFullYear(result.getFullYear() + years);
    return result;
  },

  /**
   * Get a date that is a specific number of months in the future
   */
  monthsFromNow(months: number, fromDate: Date = new Date()): Date {
    const result = new Date(fromDate);
    result.setMonth(result.getMonth() + months);
    return result;
  },

  /**
   * Get a date that is a specific number of days in the future
   */
  daysFromNow(days: number, fromDate: Date = new Date()): Date {
    const result = new Date(fromDate);
    result.setDate(result.getDate() + days);
    return result;
  },

  /**
   * Calculate the difference in days between two dates
   */
  daysBetween(startDate: Date, endDate: Date): number {
    const timeDiff = endDate.getTime() - startDate.getTime();
    return Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
  },

  /**
   * Calculate the difference in months between two dates
   */
  monthsBetween(startDate: Date, endDate: Date): number {
    const yearDiff = endDate.getFullYear() - startDate.getFullYear();
    const monthDiff = endDate.getMonth() - startDate.getMonth();
    return yearDiff * 12 + monthDiff;
  },

  /**
   * Calculate the difference in years between two dates
   */
  yearsBetween(startDate: Date, endDate: Date): number {
    return endDate.getFullYear() - startDate.getFullYear();
  },

  /**
   * Check if a date is within a specific time range
   */
  isWithinRange(date: Date, startDate: Date, endDate: Date): boolean {
    return date >= startDate && date <= endDate;
  },

  /**
   * Check if a date is recent (within specified days)
   */
  isRecent(date: Date, withinDays: number = 30): boolean {
    const cutoffDate = this.daysAgo(withinDays);
    return date >= cutoffDate;
  },

  /**
   * Format date to ISO string (YYYY-MM-DD)
   */
  toISODateString(date: Date): string {
    return date.toISOString().split('T')[0];
  },

  /**
   * Parse ISO date string safely
   */
  fromISODateString(dateString: string): Date {
    return new Date(dateString);
  },

  /**
   * Get the start of day (00:00:00)
   */
  startOfDay(date: Date): Date {
    const result = new Date(date);
    result.setHours(0, 0, 0, 0);
    return result;
  },

  /**
   * Get the end of day (23:59:59.999)
   */
  endOfDay(date: Date): Date {
    const result = new Date(date);
    result.setHours(23, 59, 59, 999);
    return result;
  }
};

// Common date ranges for fraud detection
export const DATE_RANGES = {
  // Rolling time windows
  ROLLING_1_YEAR: () => ({
    start: dateUtils.yearsAgo(1),
    end: new Date()
  }),
  
  ROLLING_6_MONTHS: () => ({
    start: dateUtils.monthsAgo(6),
    end: new Date()
  }),
  
  ROLLING_3_MONTHS: () => ({
    start: dateUtils.monthsAgo(3),
    end: new Date()
  }),
  
  ROLLING_30_DAYS: () => ({
    start: dateUtils.daysAgo(30),
    end: new Date()
  }),

  // Recent activity thresholds
  RECENT_REGISTRATION_THRESHOLD: () => dateUtils.yearsAgo(1),
  RECENT_ADDRESS_CHANGE_THRESHOLD: () => dateUtils.monthsAgo(6),
  RECENT_BANKRUPTCY_THRESHOLD: () => dateUtils.monthsAgo(3),
} as const;

// Date validation helpers
export const dateValidation = {
  /**
   * Validate that a date string is in correct format and range
   */
  isValidDateString(dateString: string): boolean {
    const date = new Date(dateString);
    return !isNaN(date.getTime()) && dateString === dateUtils.toISODateString(date);
  },

  /**
   * Validate that a date is not in the future (for historical data)
   */
  isNotFuture(date: Date): boolean {
    return date <= new Date();
  },

  /**
   * Validate that a date is within reasonable business range (e.g., after 1900)
   */
  isReasonableBusinessDate(date: Date): boolean {
    const minDate = new Date('1900-01-01');
    const maxDate = dateUtils.yearsFromNow(1); // Allow 1 year in future for planned events
    return date >= minDate && date <= maxDate;
  }
};
