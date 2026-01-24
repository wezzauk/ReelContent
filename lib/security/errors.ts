/**
 * Standard error response shapes and error handling utilities
 */

import { ZodError } from 'zod';
import superjson from 'superjson';

/**
 * Error codes matching the API spec
 */
export const ERROR_CODES = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  CONCURRENCY_LIMIT: 'CONCURRENCY_LIMIT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  INVALID_REQUEST: 'INVALID_REQUEST',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/**
 * Standard error response shape
 */
export interface ErrorResponse {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    details?: Record<string, string[]>;
  };
}

/**
 * Create a standard error response
 */
export function errorResponse(
  code: ErrorCode,
  message: string,
  details?: Record<string, string[]>
): ErrorResponse {
  return {
    success: false,
    error: {
      code,
      message,
      ...(details && { details }),
    },
  };
}

/**
 * Handle Zod validation errors
 */
export function handleValidationError(error: ZodError): ErrorResponse {
  const details: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const path = issue.path.join('.');
    if (!details[path]) {
      details[path] = [];
    }
    details[path].push(issue.message);
  }

  return errorResponse(
    ERROR_CODES.VALIDATION_ERROR,
    'Request validation failed',
    details
  );
}

/**
 * Custom API error class
 */
export class ApiError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public status: number = 400
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Safe JSON stringify that handles circular references
 */
export function safeStringify(obj: unknown): string {
  return superjson.stringify(obj);
}

/**
 * Never leak stack traces in production
 */
export function sanitizeError(error: unknown): ErrorResponse {
  if (error instanceof ApiError) {
    return errorResponse(error.code, error.message);
  }

  if (error instanceof ZodError) {
    return handleValidationError(error);
  }

  // In production, never expose internal error details
  if (process.env.NODE_ENV === 'production') {
    return errorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      'An unexpected error occurred'
    );
  }

  // In development, include the error message
  const message = error instanceof Error ? error.message : 'Unknown error';
  return errorResponse(ERROR_CODES.INTERNAL_ERROR, message);
}
