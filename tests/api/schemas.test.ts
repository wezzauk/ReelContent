/**
 * Unit tests for API validation schemas
 */

import { describe, it, expect } from 'vitest';
import {
  createSchema,
  regenerateSchema,
  createAssetSchema,
  listAssetsSchema,
  getDraftSchema,
  updateDraftSchema,
  getGenerationSchema,
} from '../../lib/api/schemas/requests.js';

describe('API Schemas', () => {
  describe('createSchema', () => {
    it('should validate a valid create request', () => {
      const validRequest = {
        prompt: 'Create a viral TikTok video script about productivity',
        platform: 'tiktok',
        title: 'Productivity Tips',
        variantCount: 3,
        idempotencyKey: 'test-key-1234567890',
      };

      const result = createSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.prompt).toBe(validRequest.prompt);
        expect(result.data.platform).toBe('tiktok');
        expect(result.data.variantCount).toBe(3);
      }
    });

    it('should reject prompt that is too short', () => {
      const invalidRequest = {
        prompt: 'Short',
        platform: 'tiktok',
      };

      const result = createSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });

    it('should reject invalid platform', () => {
      const invalidRequest = {
        prompt: 'A valid prompt for a video',
        platform: 'invalid_platform',
      };

      const result = createSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });

    it('should use default variantCount', () => {
      const minimalRequest = {
        prompt: 'A valid prompt for a video',
        platform: 'tiktok',
      };

      const result = createSchema.safeParse(minimalRequest);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.variantCount).toBe(1);
      }
    });
  });

  describe('regenerateSchema', () => {
    it('should validate a valid regenerate request', () => {
      const validRequest = {
        draftId: '550e8400-e29b-41d4-a716-446655440000',
        regenType: 'targeted',
        changes: 'Make it funnier',
        variantCount: 2,
      };

      const result = regenerateSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.draftId).toBe(validRequest.draftId);
        expect(result.data.regenType).toBe('targeted');
      }
    });

    it('should reject invalid UUID', () => {
      const invalidRequest = {
        draftId: 'not-a-uuid',
        regenType: 'targeted',
      };

      const result = regenerateSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });

    it('should default to targeted regenType', () => {
      const minimalRequest = {
        draftId: '550e8400-e29b-41d4-a716-446655440000',
      };

      const result = regenerateSchema.safeParse(minimalRequest);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.regenType).toBe('targeted');
      }
    });
  });

  describe('createAssetSchema', () => {
    it('should validate with draftId and variantId', () => {
      const validRequest = {
        draftId: '550e8400-e29b-41d4-a716-446655440000',
        variantId: '550e8400-e29b-41d4-a716-446655440001',
        title: 'My Asset',
        tags: ['viral', 'trending'],
      };

      const result = createAssetSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });

    it('should validate with raw content', () => {
      const validRequest = {
        content: 'This is raw content for the asset',
        title: 'Raw Content Asset',
      };

      const result = createAssetSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });

    it('should reject without draftId/variantId or content', () => {
      const invalidRequest = {
        title: 'Asset without source',
      };

      const result = createAssetSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });

    it('should require both draftId and variantId together', () => {
      const partialRequest = {
        draftId: '550e8400-e29b-41d4-a716-446655440000',
        // missing variantId
      };

      const result = createAssetSchema.safeParse(partialRequest);
      expect(result.success).toBe(false);
    });
  });

  describe('listAssetsSchema', () => {
    it('should validate pagination params', () => {
      const validParams = {
        cursor: 'abc123==',
        limit: '50',
      };

      const result = listAssetsSchema.safeParse(validParams);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(50);
      }
    });

    it('should apply default limit', () => {
      const minimalParams = {};

      const result = listAssetsSchema.safeParse(minimalParams);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(20);
      }
    });

    it('should validate filters', () => {
      const filteredParams = {
        status: 'active',
        platform: 'tiktok',
        tags: 'viral,trending',
        q: 'search term',
      };

      const result = listAssetsSchema.safeParse(filteredParams);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe('active');
        expect(result.data.platform).toBe('tiktok');
      }
    });

    it('should reject invalid limit', () => {
      const invalidParams = {
        limit: '500', // max is 100
      };

      const result = listAssetsSchema.safeParse(invalidParams);
      expect(result.success).toBe(false);
    });
  });

  describe('getDraftSchema', () => {
    it('should validate valid UUID', () => {
      const params = {
        id: '550e8400-e29b-41d4-a716-446655440000',
      };

      const result = getDraftSchema.safeParse(params);
      expect(result.success).toBe(true);
    });

    it('should reject invalid UUID', () => {
      const params = {
        id: 'invalid-uuid',
      };

      const result = getDraftSchema.safeParse(params);
      expect(result.success).toBe(false);
    });
  });

  describe('updateDraftSchema', () => {
    it('should validate valid update request', () => {
      const validUpdate = {
        selectedVariantId: '550e8400-e29b-41d4-a716-446655440000',
        title: 'Updated Title',
      };

      const result = updateDraftSchema.safeParse(validUpdate);
      expect(result.success).toBe(true);
    });

    it('should allow partial updates', () => {
      const partialUpdate = {
        title: 'New Title Only',
      };

      const result = updateDraftSchema.safeParse(partialUpdate);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.title).toBe('New Title Only');
      }
    });
  });

  describe('getGenerationSchema', () => {
    it('should validate valid UUID', () => {
      const params = {
        id: '550e8400-e29b-41d4-a716-446655440000',
      };

      const result = getGenerationSchema.safeParse(params);
      expect(result.success).toBe(true);
    });

    it('should reject invalid UUID', () => {
      const params = {
        id: 'not-valid',
      };

      const result = getGenerationSchema.safeParse(params);
      expect(result.success).toBe(false);
    });
  });
});
