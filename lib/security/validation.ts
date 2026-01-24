/**
 * Request validation utilities using Zod
 */

import { z, ZodError } from 'zod';
import { handleValidationError, ApiError, ERROR_CODES } from './errors';

/**
 * Parse and validate request body
 */
export async function validateBody<T>(
  request: Request,
  schema: z.ZodSchema<T>
): Promise<T> {
  try {
    const body = await request.json();
    return schema.parse(body);
  } catch (error) {
    if (error instanceof ZodError) {
      throw handleValidationError(error);
    }
    throw new ApiError(
      ERROR_CODES.INVALID_REQUEST,
      'Invalid JSON in request body',
      400
    );
  }
}

/**
 * Parse and validate query parameters
 */
export function validateQuery<T>(
  searchParams: URLSearchParams,
  schema: z.ZodSchema<T>
): T {
  const obj: Record<string, string> = {};
  searchParams.forEach((value, key) => {
    obj[key] = value;
  });

  try {
    return schema.parse(obj);
  } catch (error) {
    if (error instanceof ZodError) {
      throw handleValidationError(error);
    }
    throw new ApiError(
      ERROR_CODES.INVALID_REQUEST,
      'Invalid query parameters',
      400
    );
  }
}

/**
 * Parse and validate path parameters
 */
export function validatePath<T>(
  params: Record<string, string>,
  schema: z.ZodSchema<T>
): T {
  try {
    return schema.parse(params);
  } catch (error) {
    if (error instanceof ZodError) {
      throw handleValidationError(error);
    }
    throw new ApiError(
      ERROR_CODES.INVALID_REQUEST,
      'Invalid path parameters',
      400
    );
  }
}

/**
 * Common Zod schemas for reuse
 */
export const schemas = {
  /** UUID v4 format */
  uuid: z.string().uuid(),

  /** ISO 8601 datetime format */
  isoDateTime: z.string().datetime(),

  /** Pagination cursor (opaque base64 string) */
  cursor: z.string().min(1).max(1000),

  /** Email address */
  email: z.string().email(),

  /** Pagination parameters */
  pagination: z.object({
    cursor: z.string().optional(),
    limit: z.coerce.number().min(1).max(100).default(20),
  }),

  /** Date range for filtering */
  dateRange: z.object({
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
  }),
};

/**
 * Create a validation middleware for Next.js route handlers
 */
export function createValidator<T>(
  schema: z.ZodSchema<T>,
  source: 'body' | 'query' = 'body'
) {
  return async (request: Request): Promise<T> => {
    if (source === 'body') {
      return validateBody(request, schema);
    }
    const url = new URL(request.url);
    return validateQuery(url.searchParams, schema);
  };
}
