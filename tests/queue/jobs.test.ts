/**
 * Unit tests for queue/jobs.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  JOB_TYPE,
  JOB_LANE,
  JOB_STATUS,
  REGEN_TYPE,
  type GenerationJob,
  createGenerationJob,
  validateGenerationJob,
} from '../../lib/queue/jobs.js';

describe('queue/jobs', () => {
  describe('JOB_TYPE', () => {
    it('should have GENERATION type', () => {
      expect(JOB_TYPE.GENERATION).toBe('generation');
    });
  });

  describe('JOB_LANE', () => {
    it('should define interactive lane', () => {
      expect(JOB_LANE.INTERACTIVE).toBe('interactive');
    });

    it('should define batch lane', () => {
      expect(JOB_LANE.BATCH).toBe('batch');
    });
  });

  describe('JOB_STATUS', () => {
    it('should have all expected statuses', () => {
      expect(JOB_STATUS.PENDING).toBe('pending');
      expect(JOB_STATUS.PROCESSING).toBe('processing');
      expect(JOB_STATUS.COMPLETED).toBe('completed');
      expect(JOB_STATUS.FAILED).toBe('failed');
    });
  });

  describe('REGEN_TYPE', () => {
    it('should have targeted and full regen types', () => {
      expect(REGEN_TYPE.TARGETED).toBe('targeted');
      expect(REGEN_TYPE.FULL).toBe('full');
    });
  });

  describe('createGenerationJob', () => {
    it('should create a valid generation job', () => {
      const job = createGenerationJob({
        userId: 'user-123',
        draftId: 'draft-456',
        generationId: 'gen-789',
        variantCount: 3,
        prompt: 'Create a viral video script',
        platform: 'tiktok',
      });

      expect(job.type).toBe(JOB_TYPE.GENERATION);
      expect(job.userId).toBe('user-123');
      expect(job.draftId).toBe('draft-456');
      expect(job.generationId).toBe('gen-789');
      expect(job.variantCount).toBe(3);
      expect(job.prompt).toBe('Create a viral video script');
      expect(job.platform).toBe('tiktok');
      expect(job.isRegen).toBe(false);
      expect(job.lane).toBe(JOB_LANE.INTERACTIVE); // Default
      expect(job.jobId).toBeDefined();
      expect(job.requestId).toBeDefined();
      expect(job.createdAt).toBeDefined();
    });

    it('should use provided lane when specified', () => {
      const job = createGenerationJob({
        userId: 'user-123',
        draftId: 'draft-456',
        generationId: 'gen-789',
        variantCount: 5,
        prompt: 'Batch generate content',
        platform: 'youtube_shorts',
        lane: JOB_LANE.BATCH,
      });

      expect(job.lane).toBe(JOB_LANE.BATCH);
    });

    it('should include regen fields when provided', () => {
      const job = createGenerationJob({
        userId: 'user-123',
        draftId: 'draft-456',
        generationId: 'gen-789',
        variantCount: 1,
        prompt: 'Update the script',
        platform: 'instagram_reels',
        isRegen: true,
        parentGenerationId: 'parent-gen-123',
        regenType: REGEN_TYPE.TARGETED,
        regenChanges: 'Make it funnier',
      });

      expect(job.isRegen).toBe(true);
      expect(job.parentGenerationId).toBe('parent-gen-123');
      expect(job.regenType).toBe(REGEN_TYPE.TARGETED);
      expect(job.regenChanges).toBe('Make it funnier');
    });

    it('should include lease IDs when provided', () => {
      const job = createGenerationJob({
        userId: 'user-123',
        draftId: 'draft-456',
        generationId: 'gen-789',
        variantCount: 2,
        prompt: 'Create content',
        platform: 'tiktok',
        userLeaseId: 'lease-user-123',
        providerLeaseId: 'lease-provider-456',
      });

      expect(job.userLeaseId).toBe('lease-user-123');
      expect(job.providerLeaseId).toBe('lease-provider-456');
    });

    it('should generate unique job and request IDs', () => {
      const job1 = createGenerationJob({
        userId: 'user-123',
        draftId: 'draft-456',
        generationId: 'gen-789',
        variantCount: 1,
        prompt: 'Test',
        platform: 'tiktok',
      });

      const job2 = createGenerationJob({
        userId: 'user-123',
        draftId: 'draft-456',
        generationId: 'gen-789',
        variantCount: 1,
        prompt: 'Test',
        platform: 'tiktok',
      });

      expect(job1.jobId).not.toBe(job2.jobId);
      expect(job1.requestId).not.toBe(job2.requestId);
    });
  });

  describe('validateGenerationJob', () => {
    it('should validate a correct job payload', () => {
      const payload = {
        type: JOB_TYPE.GENERATION,
        jobId: 'job-123',
        userId: 'user-456',
        draftId: 'draft-789',
        generationId: 'gen-012',
        variantCount: 3,
        prompt: 'Test prompt',
        platform: 'tiktok',
        isRegen: false,
        createdAt: new Date().toISOString(),
        requestId: 'req-123',
      };

      const result = validateGenerationJob(payload);
      expect(result).not.toBeNull();
      expect(result?.jobId).toBe('job-123');
      expect(result?.userId).toBe('user-456');
    });

    it('should reject invalid job type', () => {
      const payload = {
        type: 'invalid_type',
        jobId: 'job-123',
        userId: 'user-456',
        generationId: 'gen-012',
      };

      const result = validateGenerationJob(payload);
      expect(result).toBeNull();
    });

    it('should reject non-generation jobs', () => {
      const payload = {
        type: 'other_job',
        jobId: 'job-123',
        userId: 'user-456',
        generationId: 'gen-012',
      };

      const result = validateGenerationJob(payload);
      expect(result).toBeNull();
    });

    it('should reject null payload', () => {
      expect(validateGenerationJob(null)).toBeNull();
    });

    it('should reject non-object payloads', () => {
      expect(validateGenerationJob('string')).toBeNull();
      expect(validateGenerationJob(123)).toBeNull();
    });

    it('should reject missing required fields', () => {
      expect(
        validateGenerationJob({ type: JOB_TYPE.GENERATION })
      ).toBeNull();

      expect(
        validateGenerationJob({
          type: JOB_TYPE.GENERATION,
          jobId: 'job-123',
          // Missing userId and generationId
        })
      ).toBeNull();
    });
  });
});
