/**
 * Unit tests for workers/worker.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { GenerationJob } from '../../lib/queue/jobs.js';
import { JOB_TYPE, JOB_LANE } from '../../lib/queue/jobs.js';

// Create mock repositories
const mockGenerationRepo = {
  findById: vi.fn(),
  updateStatus: vi.fn(),
  markFailed: vi.fn(),
};

const mockDraftRepo = {
  findById: vi.fn(),
};

const mockVariantRepo = {
  create: vi.fn(),
};

const mockUsageLedgerRepo = {
  create: vi.fn(),
};

const mockSubscriptionRepo = {
  findByUserId: vi.fn(),
};

const mockBoostRepo = {
  findActiveByUserId: vi.fn(),
};

// Create mock enforcement functions
const mockReleaseUserConcurrency = vi.fn();
const mockReleaseProviderConcurrency = vi.fn();
const mockGetMonthlyUsage = vi.fn().mockResolvedValue(0);
const mockGetHourlyUsage = vi.fn().mockResolvedValue(0);

// Mock llm-client
const mockGenerateContent = vi.fn();

// Mock dependencies before importing
vi.mock('../../lib/utils/config.js', () => ({
  config: {
    NODE_ENV: 'test',
    QSTASH_URL: 'https://test.qstash.io',
    QSTASH_TOKEN: 'test-token',
    QSTASH_CURRENT_SIGNING_KEY: 'test-signing-key',
    APP_URL: 'http://localhost:3000',
  },
}));

vi.mock('../../lib/observability/logger.js', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

vi.mock('../../lib/db/repositories.js', () => ({
  generationRepo: mockGenerationRepo,
  draftRepo: mockDraftRepo,
  variantRepo: mockVariantRepo,
  usageLedgerRepo: mockUsageLedgerRepo,
  subscriptionRepo: mockSubscriptionRepo,
  boostRepo: mockBoostRepo,
}));

vi.mock('../../lib/ai/llm-client.js', () => ({
  generateContent: mockGenerateContent,
}));

vi.mock('../../lib/enforcement/index.js', () => ({
  enforceMonthlyPool: vi.fn(),
  enforceHourlyBurst: vi.fn(),
  releaseUserConcurrency: mockReleaseUserConcurrency,
  releaseProviderConcurrency: mockReleaseProviderConcurrency,
  getMonthlyUsage: mockGetMonthlyUsage,
  getHourlyUsage: mockGetHourlyUsage,
}));

vi.mock('../../lib/billing/plans.js', () => ({
  getEffectiveLimits: vi.fn().mockReturnValue({
    gensPerMonth: 60,
    maxVariants: 1,
    fullRegenAllowed: false,
    fullRegenMonthlyCap: 0,
    userConcurrency: 1,
    providerConcurrency: 10,
  }),
}));

vi.mock('../../lib/redis/client.js', () => ({
  redis: {
    ping: vi.fn().mockResolvedValue('PONG'),
  },
}));

const {
  verifyQStashSignature,
  processGenerationJob,
  getWorkerHealth,
} = await import('../../lib/workers/worker.js');

describe('workers/worker', () => {
  describe('verifyQStashSignature', () => {
    it('should return true for valid v1 signature', () => {
      const body = '{"test":"data"}';
      const signature = 'v1=abc123';
      expect(verifyQStashSignature(signature, body)).toBe(true);
    });

    it('should return false for invalid signature format', () => {
      const body = '{"test":"data"}';
      const signature = 'invalid-signature';
      expect(verifyQStashSignature(signature, body)).toBe(false);
    });
  });

  describe('processGenerationJob', () => {
    const baseJob: GenerationJob = {
      type: JOB_TYPE.GENERATION,
      jobId: 'job-123',
      userId: 'user-456',
      draftId: 'draft-789',
      generationId: 'gen-012',
      lane: JOB_LANE.INTERACTIVE,
      variantCount: 1,
      prompt: 'Test prompt',
      platform: 'tiktok',
      isRegen: false,
      createdAt: new Date().toISOString(),
      requestId: 'req-123',
    };

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should return error when generation not found', async () => {
      mockGenerationRepo.findById.mockResolvedValue(null);

      const result = await processGenerationJob(baseJob);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Generation record not found');
      expect(result.shouldRetry).toBe(false);
    });

    it('should skip already completed generations', async () => {
      mockGenerationRepo.findById.mockResolvedValue({
        id: baseJob.generationId,
        status: 'completed',
      } as any);

      const result = await processGenerationJob(baseJob);

      expect(result.success).toBe(true);
      expect(result.shouldRetry).toBe(false);
    });

    it('should return error when draft not found', async () => {
      mockGenerationRepo.findById.mockResolvedValue({
        id: baseJob.generationId,
        status: 'pending',
      } as any);
      mockDraftRepo.findById.mockResolvedValue(null);

      const result = await processGenerationJob(baseJob);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Draft not found');
      expect(result.shouldRetry).toBe(false);
    });

    it('should successfully process a valid job', async () => {
      mockGenerationRepo.findById.mockResolvedValue({
        id: baseJob.generationId,
        status: 'pending',
      } as any);
      mockDraftRepo.findById.mockResolvedValue({
        id: baseJob.draftId,
        platform: 'tiktok',
      } as any);
      mockSubscriptionRepo.findByUserId.mockResolvedValue({ planType: 'standard' } as any);
      mockBoostRepo.findActiveByUserId.mockResolvedValue(null);
      mockGenerationRepo.updateStatus.mockResolvedValue({} as any);
      mockVariantRepo.create.mockResolvedValue({
        id: 'variant-123',
        content: 'Generated content',
        variantIndex: 1,
      } as any);
      mockGenerationRepo.updateStatus.mockResolvedValue({} as any);
      mockUsageLedgerRepo.create.mockResolvedValue({} as any);

      // Mock the llm-client generateContent function
      mockGenerateContent.mockResolvedValue({
        success: true,
        variants: [
          { text: 'Generated content', hashtags: [], metadata: { hook: 'Hook', benefit: 'Benefit', cta: 'CTA' } }
        ],
        provider: 'openai',
        model: 'gpt-4o',
        usage: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
      });

      const result = await processGenerationJob(baseJob);

      expect(result.success).toBe(true);
      expect(result.generationId).toBe(baseJob.generationId);
      expect(result.variants).toBeDefined();
      expect(result.variants?.length).toBe(1);
      expect(mockGenerateContent).toHaveBeenCalled();
    });

    it('should release leases on completion', async () => {
      mockGenerationRepo.findById.mockResolvedValue({
        id: baseJob.generationId,
        status: 'pending',
      } as any);
      mockDraftRepo.findById.mockResolvedValue({
        id: baseJob.draftId,
        platform: 'tiktok',
      } as any);
      mockGenerationRepo.updateStatus.mockResolvedValue({} as any);
      mockVariantRepo.create.mockResolvedValue({
        id: 'variant-123',
        content: 'Generated content',
        variantIndex: 1,
      } as any);
      mockGenerationRepo.updateStatus.mockResolvedValue({} as any);
      mockUsageLedgerRepo.create.mockResolvedValue({} as any);

      const jobWithLeases = {
        ...baseJob,
        userLeaseId: 'lease-user-123',
        providerLeaseId: 'lease-provider-456',
      };

      await processGenerationJob(jobWithLeases);

      expect(mockReleaseUserConcurrency).toHaveBeenCalledWith('user-456', 'lease-user-123');
      expect(mockReleaseProviderConcurrency).toHaveBeenCalledWith(
        'minimax',
        'video',
        JOB_LANE.INTERACTIVE,
        'lease-provider-456'
      );
    });

    it('should handle errors gracefully', async () => {
      mockGenerationRepo.findById.mockResolvedValue({
        id: baseJob.generationId,
        status: 'pending',
      } as any);
      mockDraftRepo.findById.mockResolvedValue({
        id: baseJob.draftId,
        platform: 'tiktok',
      } as any);
      mockGenerationRepo.updateStatus.mockRejectedValue(new Error('Database error'));
      mockGenerationRepo.markFailed.mockResolvedValue({} as any);

      const result = await processGenerationJob(baseJob);

      expect(result.success).toBe(false);
      expect(result.shouldRetry).toBe(true); // Database error is transient
    });
  });

  describe('getWorkerHealth', () => {
    it('should return healthy status when checks pass', async () => {
      mockGenerationRepo.findById.mockResolvedValue(null);

      const health = await getWorkerHealth();

      expect(health.status).toBe('healthy');
      expect(health.checks.database).toBe(true);
    });

    it('should return degraded status when database fails', async () => {
      mockGenerationRepo.findById.mockRejectedValue(new Error('Connection failed'));

      const health = await getWorkerHealth();

      expect(health.status).toBe('degraded');
      expect(health.checks.database).toBe(false);
    });
  });
});
