/**
 * Standardized Error Handling Configuration
 *
 * This file provides consistent error handling patterns and utilities
 * for all API routes and system components.
 */

import { NextResponse } from "next/server";
import { ERROR_HANDLING } from "./constants";

// Standard error types for the fraud detection system
export enum ErrorType {
  VALIDATION_ERROR = "VALIDATION_ERROR",
  NOT_FOUND = "NOT_FOUND",
  API_ERROR = "API_ERROR",
  DATABASE_ERROR = "DATABASE_ERROR",
  NETWORK_ERROR = "NETWORK_ERROR",
  AUTHENTICATION_ERROR = "AUTHENTICATION_ERROR",
  AUTHORIZATION_ERROR = "AUTHORIZATION_ERROR",
  RATE_LIMIT_ERROR = "RATE_LIMIT_ERROR",
  TIMEOUT_ERROR = "TIMEOUT_ERROR",
  UNKNOWN_ERROR = "UNKNOWN_ERROR",
}

// Standard error response interface
export interface StandardError {
  success: false;
  error: {
    type: ErrorType;
    message: string;
    details?: any;
    timestamp: string;
    requestId?: string;
  };
}

// Standard success response interface
export interface StandardSuccess<T = any> {
  success: true;
  data: T;
  timestamp: string;
  requestId?: string;
}

// Error logging utility
export class ErrorLogger {
  static log(error: Error | string, context: string, details?: any): void {
    const timestamp = new Date().toISOString();
    const errorMessage = error instanceof Error ? error.message : error;
    const errorStack = error instanceof Error ? error.stack : undefined;

    console.error(`🚨 [${timestamp}] ERROR in ${context}:`, {
      message: errorMessage,
      details,
      stack: errorStack,
    });
  }

  static warn(message: string, context: string, details?: any): void {
    const timestamp = new Date().toISOString();
    console.warn(`⚠️ [${timestamp}] WARNING in ${context}:`, message, details);
  }

  static info(message: string, context: string, details?: any): void {
    const timestamp = new Date().toISOString();
    console.log(`ℹ️ [${timestamp}] INFO in ${context}:`, message, details);
  }
}

// Standard error response builders
export class ErrorResponse {
  static validation(
    message: string,
    details?: any
  ): NextResponse<StandardError> {
    return NextResponse.json(
      {
        success: false,
        error: {
          type: ErrorType.VALIDATION_ERROR,
          message,
          details,
          timestamp: new Date().toISOString(),
        },
      },
      { status: 400 }
    );
  }

  static notFound(message: string, details?: any): NextResponse<StandardError> {
    return NextResponse.json(
      {
        success: false,
        error: {
          type: ErrorType.NOT_FOUND,
          message,
          details,
          timestamp: new Date().toISOString(),
        },
      },
      { status: 404 }
    );
  }

  static apiError(message: string, details?: any): NextResponse<StandardError> {
    return NextResponse.json(
      {
        success: false,
        error: {
          type: ErrorType.API_ERROR,
          message,
          details,
          timestamp: new Date().toISOString(),
        },
      },
      { status: 500 }
    );
  }

  static databaseError(
    message: string,
    details?: any
  ): NextResponse<StandardError> {
    return NextResponse.json(
      {
        success: false,
        error: {
          type: ErrorType.DATABASE_ERROR,
          message,
          details,
          timestamp: new Date().toISOString(),
        },
      },
      { status: 500 }
    );
  }

  static networkError(
    message: string,
    details?: any
  ): NextResponse<StandardError> {
    return NextResponse.json(
      {
        success: false,
        error: {
          type: ErrorType.NETWORK_ERROR,
          message,
          details,
          timestamp: new Date().toISOString(),
        },
      },
      { status: 503 }
    );
  }

  static rateLimit(
    message: string = "Rate limit exceeded"
  ): NextResponse<StandardError> {
    return NextResponse.json(
      {
        success: false,
        error: {
          type: ErrorType.RATE_LIMIT_ERROR,
          message,
          timestamp: new Date().toISOString(),
        },
      },
      { status: 429 }
    );
  }

  static timeout(
    message: string = "Request timeout"
  ): NextResponse<StandardError> {
    return NextResponse.json(
      {
        success: false,
        error: {
          type: ErrorType.TIMEOUT_ERROR,
          message,
          timestamp: new Date().toISOString(),
        },
      },
      { status: 408 }
    );
  }

  static internal(message: string, details?: any): NextResponse<StandardError> {
    return NextResponse.json(
      {
        success: false,
        error: {
          type: ErrorType.UNKNOWN_ERROR,
          message: "An internal error occurred",
          details: process.env.NODE_ENV === "development" ? details : undefined,
          timestamp: new Date().toISOString(),
        },
      },
      { status: 500 }
    );
  }
}

// Standard success response builder
export class SuccessResponse {
  static ok<T>(data: T, message?: string): NextResponse<StandardSuccess<T>> {
    return NextResponse.json({
      success: true,
      data,
      message,
      timestamp: new Date().toISOString(),
    });
  }

  static created<T>(
    data: T,
    message?: string
  ): NextResponse<StandardSuccess<T>> {
    return NextResponse.json(
      {
        success: true,
        data,
        message,
        timestamp: new Date().toISOString(),
      },
      { status: 201 }
    );
  }
}

// Error handling wrapper for API routes
export function withErrorHandling<T extends any[]>(
  handler: (...args: T) => Promise<NextResponse>
) {
  return async (...args: T): Promise<NextResponse> => {
    try {
      return await handler(...args);
    } catch (error) {
      ErrorLogger.log(error as Error, "API_ROUTE", { args });

      if (error instanceof Error) {
        // Map specific error types
        if (error.message.includes("not found")) {
          return ErrorResponse.notFound(error.message);
        }
        if (error.message.includes("validation")) {
          return ErrorResponse.validation(error.message);
        }
        if (
          error.message.includes("network") ||
          error.message.includes("fetch")
        ) {
          return ErrorResponse.networkError(error.message);
        }
        if (
          error.message.includes("database") ||
          error.message.includes("prisma")
        ) {
          return ErrorResponse.databaseError(error.message);
        }
      }

      return ErrorResponse.internal("An unexpected error occurred", error);
    }
  };
}

// Retry logic utility
export class RetryHandler {
  static async withRetry<T>(
    operation: () => Promise<T>,
    maxAttempts: number = ERROR_HANDLING.MAX_RETRY_ATTEMPTS,
    context: string = "operation"
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        ErrorLogger.warn(
          `Attempt ${attempt}/${maxAttempts} failed: ${lastError.message}`,
          context
        );

        if (attempt === maxAttempts) {
          throw lastError;
        }

        // Exponential backoff
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError!;
  }
}
