/**
 * API Request Validation Schemas
 *
 * Zod schemas for validating all API request payloads.
 */

import { z } from 'zod';
import { PLATFORM } from '../../db/schema.js';

// ============================================================================
// Common Schemas
// ============================================================================

/**
 * Platform enum schema
 */
export const platformSchema = z.enum([
  PLATFORM.TIKTOK,
  PLATFORM.YOUTUBE_SHORTS,
  PLATFORM.INSTAGRAM_REELS,
]);

/**
 * Regeneration type schema
 */
export const regenTypeSchema = z.enum(['targeted', 'full']);

/**
 * Pagination cursor schema
 */
export const cursorSchema = z.string().min(1).max(500);

/**
 * Pagination params schema
 */
export const paginationSchema = z.object({
  cursor: cursorSchema.optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
});

/**
 * Tags array schema
 */
export const tagsSchema = z.array(z.string().min(1).max(50)).default([]);

// ============================================================================
// Create Endpoint Schemas
// ============================================================================

/**
 * POST /v1/create request body
 */
export const createSchema = z.object({
  /** The prompt/script for generation */
  prompt: z.string().min(10).max(5000),
  /** Target platform */
  platform: platformSchema,
  /** Optional title for the draft */
  title: z.string().min(1).max(200).optional(),
  /** Number of variants to generate (default: 1) */
  variantCount: z.coerce.number().min(1).max(5).default(1),
  /** Idempotency key to prevent duplicate creations */
  idempotencyKey: z.string().min(16).max(128).optional(),
});

export type CreateRequest = z.infer<typeof createSchema>;

// ============================================================================
// Regenerate Endpoint Schemas
// ============================================================================

/**
 * POST /v1/regenerate request body
 */
export const regenerateSchema = z.object({
  /** ID of the draft to regenerate */
  draftId: z.string().uuid(),
  /** Type of regeneration */
  regenType: regenTypeSchema.default('targeted'),
  /** Changes for targeted regeneration (required for targeted) */
  changes: z.string().min(1).max(1000).optional(),
  /** Number of variants to generate (default: 1) */
  variantCount: z.coerce.number().min(1).max(5).default(1),
  /** Idempotency key to prevent duplicate regenerations */
  idempotencyKey: z.string().min(16).max(128).optional(),
});

export type RegenerateRequest = z.infer<typeof regenerateSchema>;

// ============================================================================
// Library - Create Asset Schema
// ============================================================================

/**
 * POST /v1/library/assets request body
 */
export const createAssetSchema = z.object({
  /** Source draft ID (optional if raw content provided) */
  draftId: z.string().uuid().optional(),
  /** Source variant ID (optional if raw content provided) */
  variantId: z.string().uuid().optional(),
  /** Raw content (used if not saving from draft/variant) */
  content: z.string().min(1).max(10000).optional(),
  /** Title for the asset */
  title: z.string().min(1).max(200).optional(),
  /** Platform tag */
  platform: platformSchema.optional(),
  /** Tags for categorization */
  tags: tagsSchema,
  /** Idempotency key */
  idempotencyKey: z.string().min(16).max(128).optional(),
}).refine((data) => (data.draftId && data.variantId) || data.content, {
  message: 'Either (draftId + variantId) or content must be provided',
  path: ['draftId'],
});

export type CreateAssetRequest = z.infer<typeof createAssetSchema>;

// ============================================================================
// Library - List Assets Schema
// ============================================================================

/**
 * GET /v1/library/assets query params
 */
export const listAssetsSchema = paginationSchema.extend({
  /** Filter by status */
  status: z.enum(['draft', 'active', 'archived']).optional(),
  /** Filter by platform */
  platform: platformSchema.optional(),
  /** Filter by tags (comma-separated) */
  tags: z.string().optional(),
  /** Search query (matches title and content) */
  q: z.string().max(200).optional(),
});

export type ListAssetsRequest = z.infer<typeof listAssetsSchema>;

// ============================================================================
// Draft - Get Schema
// ============================================================================

/**
 * GET /v1/drafts/:id path params
 */
export const getDraftSchema = z.object({
  id: z.string().uuid(),
});

export type GetDraftRequest = z.infer<typeof getDraftSchema>;

// ============================================================================
// Draft - Update Schema
// ============================================================================

/**
 * PATCH /v1/drafts/:id request body
 */
export const updateDraftSchema = z.object({
  /** Selected variant ID */
  selectedVariantId: z.string().uuid().optional(),
  /** Title update */
  title: z.string().min(1).max(200).optional(),
  /** Settings JSON update */
  settings: z.string().optional(),
});

export type UpdateDraftRequest = z.infer<typeof updateDraftSchema>;

// ============================================================================
// Generation - Get Schema
// ============================================================================

/**
 * GET /v1/generations/:id path params
 */
export const getGenerationSchema = z.object({
  id: z.string().uuid(),
});

export type GetGenerationRequest = z.infer<typeof getGenerationSchema>;

// ============================================================================
// Response Schemas (for documentation/validation)
// ============================================================================

/**
 * Standard success response
 */
export const successResponseSchema = z.object({
  success: z.literal(true),
});

/**
 * Created draft/generation response
 */
export const createdResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    draftId: z.string().uuid(),
    generationId: z.string().uuid(),
  }),
});

/**
 * Asset created response
 */
export const assetCreatedResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    assetId: z.string().uuid(),
  }),
});

/**
 * Paginated list response
 */
export const paginatedResponseSchema = <T extends z.ZodType>(itemSchema: T) =>
  z.object({
    success: z.literal(true),
    data: z.array(itemSchema),
    nextCursor: z.string().optional(),
  });

/**
 * Draft response
 */
export const draftResponseSchema = z.object({
  id: z.string().uuid(),
  title: z.string().nullable(),
  prompt: z.string(),
  platform: z.string(),
  selectedVariantId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

/**
 * Variant response
 */
export const variantResponseSchema = z.object({
  id: z.string().uuid(),
  variantIndex: z.number(),
  content: z.string(),
  videoUrl: z.string().nullable(),
  thumbnailUrl: z.string().nullable(),
  createdAt: z.string().datetime(),
});

/**
 * Generation response
 */
export const generationResponseSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['pending', 'processing', 'completed', 'failed']),
  errorMessage: z.string().nullable(),
  variants: z.array(variantResponseSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
});

/**
 * Asset response
 */
export const assetResponseSchema = z.object({
  id: z.string().uuid(),
  title: z.string().nullable(),
  content: z.string().nullable(),
  platform: z.string().nullable(),
  tags: z.array(z.string()),
  status: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
