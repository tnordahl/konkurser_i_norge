/**
 * Input Validation Utilities
 *
 * This file provides standardized validation functions for all inputs
 * in the fraud detection system to ensure data integrity and security.
 */

import { VALIDATION, LOCATION, checks } from "./constants";

// Validation result type
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

// Input validation utilities
export class InputValidator {
  /**
   * Validate Norwegian kommune number
   */
  static validateKommuneNumber(kommuneNumber: string): ValidationResult {
    const errors: string[] = [];

    if (!kommuneNumber) {
      errors.push("Kommune number is required");
      return { isValid: false, errors };
    }

    if (typeof kommuneNumber !== "string") {
      errors.push("Kommune number must be a string");
    } else {
      // Remove any whitespace
      const cleaned = kommuneNumber.trim();

      if (cleaned.length !== VALIDATION.KOMMUNE_NUMBER_LENGTH) {
        errors.push(
          `Kommune number must be exactly ${VALIDATION.KOMMUNE_NUMBER_LENGTH} digits`
        );
      }

      if (!/^\d+$/.test(cleaned)) {
        errors.push("Kommune number must contain only digits");
      }

      if (!checks.isValidKommuneNumber(cleaned)) {
        errors.push(
          `Kommune number must be between ${LOCATION.MIN_KOMMUNE_NUMBER} and ${LOCATION.MAX_KOMMUNE_NUMBER}`
        );
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate Norwegian organization number
   */
  static validateOrganizationNumber(orgNumber: string): ValidationResult {
    const errors: string[] = [];

    if (!orgNumber) {
      errors.push("Organization number is required");
      return { isValid: false, errors };
    }

    if (typeof orgNumber !== "string") {
      errors.push("Organization number must be a string");
    } else {
      // Remove any whitespace
      const cleaned = orgNumber.trim();

      if (cleaned.length !== VALIDATION.ORG_NUMBER_LENGTH) {
        errors.push(
          `Organization number must be exactly ${VALIDATION.ORG_NUMBER_LENGTH} digits`
        );
      }

      if (!/^\d+$/.test(cleaned)) {
        errors.push("Organization number must contain only digits");
      }

      if (!checks.isValidOrganizationNumber(cleaned)) {
        errors.push("Invalid organization number format");
      }

      // Norwegian organization number checksum validation
      if (cleaned.length === VALIDATION.ORG_NUMBER_LENGTH) {
        if (!this.validateNorwegianOrgNumberChecksum(cleaned)) {
          errors.push("Invalid organization number checksum");
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate risk score
   */
  static validateRiskScore(score: number): ValidationResult {
    const errors: string[] = [];

    if (typeof score !== "number") {
      errors.push("Risk score must be a number");
    } else {
      if (
        score < VALIDATION.MIN_RISK_SCORE ||
        score > VALIDATION.MAX_RISK_SCORE
      ) {
        errors.push(
          `Risk score must be between ${VALIDATION.MIN_RISK_SCORE} and ${VALIDATION.MAX_RISK_SCORE}`
        );
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate investigation priority
   */
  static validateInvestigationPriority(priority: number): ValidationResult {
    const errors: string[] = [];

    if (typeof priority !== "number") {
      errors.push("Investigation priority must be a number");
    } else {
      if (
        priority < VALIDATION.MIN_INVESTIGATION_PRIORITY ||
        priority > VALIDATION.MAX_INVESTIGATION_PRIORITY
      ) {
        errors.push(
          `Investigation priority must be between ${VALIDATION.MIN_INVESTIGATION_PRIORITY} and ${VALIDATION.MAX_INVESTIGATION_PRIORITY}`
        );
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate company name
   */
  static validateCompanyName(name: string): ValidationResult {
    const errors: string[] = [];

    if (!name) {
      errors.push("Company name is required");
      return { isValid: false, errors };
    }

    if (typeof name !== "string") {
      errors.push("Company name must be a string");
    } else {
      const trimmed = name.trim();

      if (trimmed.length === 0) {
        errors.push("Company name cannot be empty");
      } else if (trimmed.length > VALIDATION.MAX_COMPANY_NAME_LENGTH) {
        errors.push(
          `Company name cannot exceed ${VALIDATION.MAX_COMPANY_NAME_LENGTH} characters`
        );
      }

      // Check for suspicious patterns (basic security)
      if (/<script|javascript:|data:|vbscript:/i.test(trimmed)) {
        errors.push("Company name contains invalid characters");
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate date string (ISO format)
   */
  static validateDateString(dateString: string): ValidationResult {
    const errors: string[] = [];

    if (!dateString) {
      errors.push("Date is required");
      return { isValid: false, errors };
    }

    if (typeof dateString !== "string") {
      errors.push("Date must be a string");
    } else {
      const date = new Date(dateString);

      if (isNaN(date.getTime())) {
        errors.push("Invalid date format");
      } else {
        // Check if date is reasonable (not too far in past or future)
        const minDate = new Date("1900-01-01");
        const maxDate = new Date();
        maxDate.setFullYear(maxDate.getFullYear() + 1);

        if (date < minDate || date > maxDate) {
          errors.push("Date must be between 1900 and next year");
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate search query
   */
  static validateSearchQuery(query: string): ValidationResult {
    const errors: string[] = [];

    if (!query) {
      errors.push("Search query is required");
      return { isValid: false, errors };
    }

    if (typeof query !== "string") {
      errors.push("Search query must be a string");
    } else {
      const trimmed = query.trim();

      if (trimmed.length === 0) {
        errors.push("Search query cannot be empty");
      } else if (trimmed.length > VALIDATION.MAX_SEARCH_QUERY_LENGTH) {
        errors.push(
          `Search query cannot exceed ${VALIDATION.MAX_SEARCH_QUERY_LENGTH} characters`
        );
      }

      // Check for SQL injection patterns
      const sqlInjectionPattern =
        /('|\\')|(;|\\;)|(\\x)|(--|\/\*)|(select|insert|update|delete|drop|create|alter|exec|union|script)/i;
      if (sqlInjectionPattern.test(trimmed)) {
        errors.push("Search query contains invalid characters");
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Norwegian organization number checksum validation (MOD11)
   */
  private static validateNorwegianOrgNumberChecksum(
    orgNumber: string
  ): boolean {
    if (orgNumber.length !== 9) return false;

    const weights = [3, 2, 7, 6, 5, 4, 3, 2];
    let sum = 0;

    for (let i = 0; i < 8; i++) {
      sum += parseInt(orgNumber[i]) * weights[i];
    }

    const remainder = sum % 11;
    const checkDigit = remainder === 0 ? 0 : 11 - remainder;

    // If check digit is 10, the organization number is invalid
    if (checkDigit === 10) return false;

    return parseInt(orgNumber[8]) === checkDigit;
  }

  /**
   * Validate multiple fields at once
   */
  static validateFields(
    fields: Record<string, any>,
    rules: Record<string, (value: any) => ValidationResult>
  ): ValidationResult {
    const allErrors: string[] = [];

    for (const [fieldName, value] of Object.entries(fields)) {
      const validator = rules[fieldName];
      if (validator) {
        const result = validator(value);
        if (!result.isValid) {
          allErrors.push(
            ...result.errors.map((error) => `${fieldName}: ${error}`)
          );
        }
      }
    }

    return {
      isValid: allErrors.length === 0,
      errors: allErrors,
    };
  }

  /**
   * Sanitize string input (remove dangerous characters)
   */
  static sanitizeString(input: string): string {
    if (typeof input !== "string") return "";

    return input
      .trim()
      .replace(/[<>]/g, "") // Remove angle brackets
      .replace(/javascript:/gi, "") // Remove javascript: protocol
      .replace(/data:/gi, "") // Remove data: protocol
      .replace(/vbscript:/gi, "") // Remove vbscript: protocol
      .slice(0, 1000); // Limit length
  }

  /**
   * Validate and sanitize kommune number
   */
  static sanitizeKommuneNumber(kommuneNumber: string): string {
    if (typeof kommuneNumber !== "string") return "";
    return kommuneNumber.trim().replace(/\D/g, "").slice(0, 4);
  }

  /**
   * Validate and sanitize organization number
   */
  static sanitizeOrganizationNumber(orgNumber: string): string {
    if (typeof orgNumber !== "string") return "";
    return orgNumber.trim().replace(/\D/g, "").slice(0, 9);
  }
}
