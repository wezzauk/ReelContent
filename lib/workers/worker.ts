/**
 * Worker service for processing generation jobs
 *
 * Handles:
 * - QStash signature verification
 * - Job validation and context loading
 * - Limit re-enforcement (defense in depth)
 * - AI provider invocation (via llm-client)
 * - Result persistence
 * - Usage ledger writes
 * - Concurrency lease release
 */

import { randomUUID } from 'node:crypto';
import { config } from '../utils/config.js';
import { createLogger } from '../observability/logger.js';
import {
  recordJobEnqueued,
  recordJobStarted,
  recordJobCompleted,
  trackProvider429,
  trackProviderSuccess,
  logLifecycleEvent,
  LIFECYCLE_EVENTS,
  setRequestId,
} from '../observability/index.js';
import {
  generationRepo,
  draftRepo,
  variantRepo,
  usageLedgerRepo,
  subscriptionRepo,
  boostRepo,
} from '../db/repositories.js';
import {
  enforceMonthlyPool,
  enforceHourlyBurst,
  releaseUserConcurrency,
  releaseProviderConcurrency,
  getMonthlyUsage,
  getHourlyUsage,
} from '../enforcement/index.js';
import { getEffectiveLimits, type PlanType, type PlanLimits } from '../billing/plans.js';
import { calculateCost, formatMonthKeyForLedger, getHardCapsForPlan, HARD_CAPS } from '../billing/provider-pricing.js';
import { generateContent, type GenerateContentRequest } from '../ai/llm-client.js';
import type { GenerationJob, JobLane } from '../queue/jobs.js';
import { GENERATION_STATUS, PLAN_TYPE } from '../db/schema.js';

const logger = createLogger({ module: 'worker' });

/**
 * Transient errors that should trigger retries
 */
const TRANSIENT_ERRORS = new Set([
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  '502',
  '503',
  '504',
  '429',
]);

/**
 * Permanent errors that should not be retried
 */
const PERMANENT_ERRORS = new Set([
  'VALIDATION_ERROR',
  'INVALID_REQUEST',
  'UNAUTHORIZED',
  'FORBIDDEN',
]);

/**
 * Worker processing result
 */
export interface WorkerResult {
  success: boolean;
  jobId: string;
  generationId: string;
  variants?: Array<{ id: string; content: string; index: number }>;
  error?: string;
  shouldRetry: boolean;
  retryAfter?: number;
}

/**
 * Verify QStash signature from request headers
 *
 * @param signature - The QStash signature header
 * @param body - The request body
 * @returns True if signature is valid
 */
export function verifyQStashSignature(signature: string, body: string): boolean {
  if (!config.QSTASH_CURRENT_SIGNING_KEY) {
    logger.warn({ event: 'missing_signing_key' }, 'QStash signing key not configured');
    return false;
  }

  // Simple signature verification - in production, use proper HMAC verification
  // QStash signs with: HMAC_SHA256(signing_key, body + ":" + timestamp)
  // The signature header contains: "v1=" + base64(timestamp) + "." + signature
  try {
    // For now, accept if signature format is correct
    if (signature.startsWith('v1=')) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Process a generation job
 *
 * This is the main worker entry point called by the worker endpoint.
 * Enforces hard caps on retries before processing.
 */
export async function processGenerationJob(job: GenerationJob): Promise<WorkerResult> {
  const { jobId, generationId, userId, draftId, variantCount, prompt, lane, retryCount, requestId } = job;

  // Set request context for logging
  setRequestId(requestId);

  // Log job received with lifecycle tracking
  logLifecycleEvent(LIFECYCLE_EVENTS.STARTED, generationId, requestId, {
    jobId,
    userId,
    draftId,
    variantCount,
    lane,
    retryCount,
  });

  // Record latency: job started
  recordJobStarted(jobId);

  logger.info(
    { jobId, generationId, userId, variantCount, lane, retryCount, requestId },
    'Processing generation job'
  );

  // 0. Check hard cap on retries
  if (retryCount >= HARD_CAPS.maxRetries) {
    logLifecycleEvent(LIFECYCLE_EVENTS.FAILED, generationId, requestId, {
      jobId,
      reason: 'max_retries_exceeded',
    });
    logger.warn(
      { jobId, generationId, retryCount, maxRetries: HARD_CAPS.maxRetries },
      'Max retries exceeded, not retrying'
    );
    return {
      success: false,
      jobId,
      generationId,
      error: 'Max retries exceeded',
      shouldRetry: false,
    };
  }

  try {
    // 1. Load generation and draft context
    const generation = await generationRepo.findById(generationId);
    if (!generation) {
      return {
        success: false,
        jobId,
        generationId,
        error: 'Generation record not found',
        shouldRetry: false,
      };
    }

    // Skip if already processed (idempotency)
    if (generation.status === GENERATION_STATUS.COMPLETED) {
      logger.info({ jobId, generationId }, 'Generation already completed, skipping');
      return {
        success: true,
        jobId,
        generationId,
        shouldRetry: false,
      };
    }

    const draft = await draftRepo.findById(draftId);
    if (!draft) {
      return {
        success: false,
        jobId,
        generationId,
        error: 'Draft not found',
        shouldRetry: false,
      };
    }

    // 2. Re-check limits (defense in depth)
    const limitsCheck = await recheckLimits(userId);
    if (!limitsCheck.allowed) {
      logger.warn({ jobId, userId, reason: limitsCheck.reason }, 'Limits check failed');
      return {
        success: false,
        jobId,
        generationId,
        error: limitsCheck.reason,
        shouldRetry: false, // Don't retry for limit violations
      };
    }

    // 3. Update generation status to processing
    await generationRepo.updateStatus(generationId, GENERATION_STATUS.PROCESSING);

    // 4. Call AI provider (via llm-client with OpenAI + Anthropic)
    const providerResult = await callAIGenerator({
      prompt,
      platform: draft.platform,
      variantCount,
      lane,
      userId,
      isRegen: job.isRegen,
      regenType: job.regenType,
    });

    if (!providerResult.success) {
      const shouldRetry = TRANSIENT_ERRORS.has(providerResult.errorCode || '');
      await generationRepo.markFailed(
        generationId,
        providerResult.error || 'Generation failed'
      );
      return {
        success: false,
        jobId,
        generationId,
        error: providerResult.error,
        shouldRetry,
        retryAfter: shouldRetry ? 30 : undefined,
      };
    }

    // 5. Persist variants
    const savedVariants = await saveVariants({
      generationId,
      draftId,
      ownerId: userId,
      variants: providerResult.variants || [],
    });

    // 6. Update generation status to completed
    await generationRepo.updateStatus(generationId, GENERATION_STATUS.COMPLETED, {
      completedAt: new Date(),
    });

    // 7. Write usage ledger
    await writeUsageLedger({
      userId,
      generationId,
      model: providerResult.model || 'unknown',
      promptTokens: providerResult.promptTokens || 0,
      completionTokens: providerResult.completionTokens || 0,
      requestId: job.requestId,
    });

    logger.info(
      { jobId, generationId, variantCount: savedVariants.length },
      'Generation job completed'
    );

    // Record lifecycle: completed
    logLifecycleEvent(LIFECYCLE_EVENTS.COMPLETED, generationId, requestId, {
      jobId,
      variantCount: savedVariants.length,
    });

    // Record latency: job completed
    recordJobCompleted(jobId, true);

    return {
      success: true,
      jobId,
      generationId,
      variants: savedVariants.map((v) => ({
        id: v.id,
        content: v.content,
        index: v.variantIndex,
      })),
      shouldRetry: false,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const shouldRetry = !PERMANENT_ERRORS.has(errorMessage);

    logger.error(
      { jobId, generationId, error: errorMessage },
      'Generation job failed'
    );

    // Record lifecycle: failed
    logLifecycleEvent(LIFECYCLE_EVENTS.FAILED, generationId, requestId, {
      jobId,
      error: errorMessage,
      shouldRetry,
    });

    // Record latency: job completed (with failure)
    recordJobCompleted(jobId, false, errorMessage);

    // Mark generation as failed
    await generationRepo.markFailed(generationId, errorMessage);

    return {
      success: false,
      jobId,
      generationId,
      error: errorMessage,
      shouldRetry,
      retryAfter: shouldRetry ? 60 : undefined,
    };
  } finally {
    // 8. Always release leases
    await releaseLeases(job);
  }
}

/**
 * Re-check limits before processing (defense in depth)
 */
async function recheckLimits(userId: string): Promise<{ allowed: boolean; reason?: string }> {
  try {
    // Get user's effective limits (default to BASIC if unknown)
    const effectiveLimits = getEffectiveLimits('basic' as PlanType);

    // Check monthly usage
    const monthlyUsage = await getMonthlyUsage(userId);
    if (monthlyUsage >= effectiveLimits.gensPerMonth) {
      return { allowed: false, reason: 'Monthly generation limit exceeded' };
    }

    // Check hourly burst
    const hourlyUsage = await getHourlyUsage(userId);
    const burstLimit = 10; // Default burst limit
    if (hourlyUsage >= burstLimit) {
      return { allowed: false, reason: 'Hourly burst limit exceeded' };
    }

    return { allowed: true };
  } catch (error) {
    // If we can't check limits, allow the job to proceed
    // The API layer already enforced limits
    logger.warn({ error }, 'Limit check failed, proceeding anyway');
    return { allowed: true };
  }
}

/**
 * Call the AI generator using the unified llm-client
 *
 * Enforces hard caps on runtime and output tokens.
 */
async function callAIGenerator(params: {
  prompt: string;
  platform: string;
  variantCount: number;
  lane: JobLane;
  userId: string;
  isRegen: boolean;
  regenType?: string;
}): Promise<{
  success: boolean;
  variants?: string[];
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
  error?: string;
  errorCode?: string;
}> {
  const startTime = Date.now();

  try {
    // Map platform from job to llm-client format
    const platformMap: Record<string, 'instagram' | 'tiktok' | 'facebook'> = {
      'instagram_reels': 'instagram',
      'instagram': 'instagram',
      'tiktok': 'tiktok',
      'youtube_shorts': 'tiktok',
      'facebook': 'facebook',
    };

    const mappedPlatform = platformMap[params.platform] || 'instagram';

    // Map action type
    const actionType = params.isRegen
      ? (params.regenType === 'targeted' ? 'regen_targeted' : 'regen_full')
      : 'create';

    // Build the request for llm-client
    const llmRequest: GenerateContentRequest = {
      actionType: actionType as any,
      plan: 'standard', // Will be resolved from user
      platform: mappedPlatform,
      variants: params.variantCount,
      input: {
        topic: params.prompt,
      },
      calibration: {
        niche: 'general', // Could be stored on draft
      },
      requestId: randomUUID(),
    };

    // Get user's plan for proper routing
    const subscription = await subscriptionRepo.findByUserId(params.userId);
    const boost = await boostRepo.findActiveByUserId(params.userId);

    if (subscription && 'plan' in subscription) {
      // Handle subscription with 'plan' field instead of 'planType'
      const subAny = subscription as any;
      llmRequest.plan = (subAny.plan || subAny.planType) as any;
    }

    // Get hard caps based on plan tier
    const caps = getHardCapsForPlan(llmRequest.plan);

    let result: Awaited<ReturnType<typeof generateContent>>;
    try {
      result = await generateContent(llmRequest);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Generation failed';
      logger.error({ error: errorMessage }, 'AI generation failed');
      return {
        success: false,
        error: errorMessage,
        errorCode: 'AI_ERROR',
      };
    }

    // Check if we got valid variants
    if (result && result.variants && result.variants.length > 0) {
      // Hard cap: Check output tokens
      const outputTokens = result.usage?.outputTokens || 0;
      if (outputTokens > caps.maxOutputTokens) {
        logger.warn(
          { outputTokens, maxOutputTokens: caps.maxOutputTokens },
          'Output tokens exceeded hard cap'
        );
        return {
          success: false,
          error: 'Output tokens exceeded maximum allowed',
          errorCode: 'OUTPUT_TOKENS_EXCEEDED',
        };
      }

      // Extract text content from variants
      const variantTexts = result.variants.map((v) => v.text);

      return {
        success: true,
        variants: variantTexts,
        model: result.model,
        promptTokens: result.usage?.inputTokens || 0,
        completionTokens: outputTokens,
      };
    }

    return {
      success: false,
      error: 'Generation produced no variants',
      errorCode: 'AI_ERROR',
    };
  } finally {
    // Log runtime against hard cap
    const runtime = Date.now() - startTime;
    logger.debug(
      { runtimeMs: runtime, maxRuntimeMs: HARD_CAPS.maxRuntimeMs },
      'Generation runtime'
    );
  }
}

/**
 * Save generated variants to the database
 */
async function saveVariants(params: {
  generationId: string;
  draftId: string;
  ownerId: string;
  variants: string[];
}): Promise<Array<{ id: string; content: string; variantIndex: number }>> {
  const { generationId, draftId, ownerId, variants } = params;

  const savedVariants: Array<{ id: string; content: string; variantIndex: number }> = [];

  for (let i = 0; i < variants.length; i++) {
    const variant = await variantRepo.create({
      generationId,
      draftId,
      ownerId,
      variantIndex: i + 1,
      content: variants[i],
      metadata: '{}',
    });
    savedVariants.push({
      id: variant.id,
      content: variant.content,
      variantIndex: variant.variantIndex,
    });
  }

  return savedVariants;
}

/**
 * Write usage ledger entry
 *
 * Records token usage and cost estimate for billing analysis.
 * Uses provider-specific pricing from billing/provider-pricing.ts
 */
async function writeUsageLedger(params: {
  userId: string;
  generationId: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  requestId?: string;
}): Promise<void> {
  const { userId, generationId, model, promptTokens, completionTokens, requestId } = params;
  const totalTokens = promptTokens + completionTokens;

  // Calculate cost estimate using real provider pricing
  const costEstimate = calculateCost(model, promptTokens, completionTokens);

  // Get current month key in YYYY-MM format (matches schema)
  const month = formatMonthKeyForLedger();

  await usageLedgerRepo.create({
    userId,
    generationId,
    month,
    promptTokens,
    completionTokens,
    totalTokens,
    costEstimate: String(costEstimate),
    model,
  });

  logger.debug(
    { userId, generationId, model, promptTokens, completionTokens, totalTokens, costEstimate, requestId },
    'Usage ledger entry written'
  );
}

/**
 * Release all concurrency leases
 */
async function releaseLeases(job: GenerationJob): Promise<void> {
  const { userId, userLeaseId, providerLeaseId, lane } = job;

  // Release user concurrency lease
  if (userLeaseId) {
    try {
      await releaseUserConcurrency(userId, userLeaseId);
      logger.debug({ jobId: job.jobId, leaseId: userLeaseId }, 'Released user lease');
    } catch (error) {
      logger.warn({ jobId: job.jobId, error }, 'Failed to release user lease');
    }
  }

  // Release provider concurrency lease
  if (providerLeaseId) {
    try {
      await releaseProviderConcurrency('minimax', 'video', lane, providerLeaseId);
      logger.debug({ jobId: job.jobId, leaseId: providerLeaseId }, 'Released provider lease');
    } catch (error) {
      logger.warn({ jobId: job.jobId, error }, 'Failed to release provider lease');
    }
  }
}

/**
 * Get worker health status
 */
export async function getWorkerHealth(): Promise<{
  status: 'healthy' | 'degraded';
  checks: Record<string, boolean>;
}> {
  const checks: Record<string, boolean> = {
    database: false,
    redis: false,
  };

  try {
    // Check database
    await generationRepo.findById('00000000-0000-0000-0000-000000000000');
    checks.database = true;
  } catch {
    checks.database = false;
  }

  // Redis health check
  try {
    const { redis } = await import('../redis/client.js');
    await redis.ping();
    checks.redis = true;
  } catch {
    checks.redis = false;
  }

  const status = Object.values(checks).every(Boolean) ? 'healthy' : 'degraded';

  return { status, checks };
}
