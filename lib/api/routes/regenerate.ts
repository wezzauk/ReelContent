/**
 * Regenerate Handler
 *
 * Handles POST /v1/regenerate - Regenerates content from an existing draft.
 *
 * Flow:
 * 1. Authenticate user
 * 2. Validate request body
 * 3. Check idempotency key
 * 4. Check regeneration cooldown
 * 5. Resolve effective plan limits
 * 6. Enforce monthly pool + hourly burst limits
 * 7. Handle targeted vs full regen (Standard cap on full)
 * 8. Acquire user + provider concurrency leases
 * 9. Create generation record
 * 10. Enqueue generation job
 * 11. Return 202 Accepted
 */

import { randomUUID } from 'node:crypto';
import { ApiError, ERROR_CODES } from '../../security/errors.js';
import { getUserFromHeader } from '../../security/auth.js';
import { validateBody } from '../../security/validation.js';
import {
  regenerateSchema,
  type RegenerateRequest,
} from '../schemas/requests.js';
import {
  draftRepo,
  generationRepo,
  subscriptionRepo,
  boostRepo,
} from '../../db/repositories.js';
import {
  enforceMonthlyPool,
  enforceHourlyBurst,
  enforceFullRegenCap,
  acquireUserConcurrency,
  acquireProviderConcurrency,
  checkAndSetRegenCooldown,
  getOrSetIdempotency,
} from '../../enforcement/index.js';
import { getEffectiveLimits, PLANS } from '../../billing/plans.js';
import { enqueueWithRetry, JOB_LANE } from '../../queue/enqueue.js';
import { logger } from '../../observability/logger.js';
import { getRequestId } from '../../observability/request-id.js';
import { PLAN_TYPE } from '../../db/schema.js';

/**
 * Handle POST /v1/regenerate
 */
export async function handleRegenerate(request: Request): Promise<Response> {
  const requestId = getRequestId();
  const log = logger.child({ requestId, handler: 'regenerate' });

  try {
    // 1. Authenticate
    const user = await getUserFromHeader(request.headers.get('authorization'));
    if (!user) {
      throw new ApiError(ERROR_CODES.UNAUTHORIZED, 'Authentication required', 401);
    }

    log.info({ userId: user.userId }, 'User authenticated');

    // 2. Validate request body
    const body = await validateBody(request, regenerateSchema);
    log.info({ draftId: body.draftId, regenType: body.regenType }, 'Request validated');

    // 3. Verify draft exists and belongs to user
    const draft = await draftRepo.findById(body.draftId);
    if (!draft) {
      throw new ApiError(ERROR_CODES.NOT_FOUND, 'Draft not found', 404);
    }
    if (draft.ownerId !== user.userId) {
      throw new ApiError(ERROR_CODES.FORBIDDEN, 'Not authorized to access this draft', 403);
    }

    log.info({ draftId: draft.id }, 'Draft verified');

    // 4. Check idempotency (if provided)
    if (body.idempotencyKey) {
      const existing = await generationRepo.findByIdemKey(body.idempotencyKey);
      if (existing) {
        log.warn({ idempotencyKey: body.idempotencyKey }, 'Duplicate request detected');
        return Response.json({
          success: true,
          data: {
            draftId: draft.id,
            generationId: existing.id,
            duplicated: true,
          },
        }, { status: 200 });
      }
    }

    // 5. Check regeneration cooldown
    const cooldown = await checkAndSetRegenCooldown(user.userId, body.draftId);
    if (!cooldown.allowed) {
      log.warn({ ttl: cooldown.ttlRemaining }, 'Regeneration cooldown active');
      throw new ApiError(
        ERROR_CODES.RATE_LIMITED,
        `Please wait ${Math.ceil(cooldown.ttlRemaining / 60)} seconds before regenerating this draft.`,
        429
      );
    }

    // 6. Resolve effective plan limits
    const subscription = await subscriptionRepo.findByUserId(user.userId);
    const boost = await boostRepo.findActiveByUserId(user.userId);
    const limits = getEffectiveLimits(
      subscription?.plan ?? PLAN_TYPE.BASIC,
      boost?.expiresAt?.toISOString()
    );

    log.info({ plan: subscription?.plan, isBoosted: !!boost, limits }, 'Effective limits resolved');

    // 7. Enforce monthly pool
    const monthlyResult = await enforceMonthlyPool(user.userId, limits.gensPerMonth);
    if (!monthlyResult.success) {
      throw new ApiError(
        ERROR_CODES.QUOTA_EXCEEDED,
        'Monthly generation limit reached.',
        403
      );
    }

    // 8. Enforce hourly burst
    const burstResult = await enforceHourlyBurst(user.userId);
    if (!burstResult.success) {
      throw new ApiError(
        ERROR_CODES.RATE_LIMITED,
        'Hourly request limit exceeded.',
        429
      );
    }

    // 9. Handle full regeneration cap (Standard plan limit)
    if (body.regenType === 'full') {
      if (!limits.fullRegenAllowed) {
        throw new ApiError(
          ERROR_CODES.FORBIDDEN,
          'Full regeneration is not available on your plan.',
          403
        );
      }

      if (limits.fullRegenMonthlyCap !== Infinity) {
        const fullRegenResult = await enforceFullRegenCap(
          user.userId,
          limits.fullRegenMonthlyCap
        );
        if (!fullRegenResult.success) {
          throw new ApiError(
            ERROR_CODES.QUOTA_EXCEEDED,
            `Full regeneration limit reached (${limits.fullRegenMonthlyCap} per month).`,
            403
          );
        }
      }
    }

    // 10. Acquire user concurrency lease
    const userLease = await acquireUserConcurrency(
      user.userId,
      'pending',
      limits.userConcurrency
    );
    if (!userLease.acquired) {
      throw new ApiError(
        ERROR_CODES.CONCURRENCY_LIMIT,
        'Too many concurrent generations.',
        429
      );
    }

    // 11. Acquire provider concurrency lease
    const providerLease = await acquireProviderConcurrency(
      'minimax',
      'video',
      JOB_LANE.INTERACTIVE,
      `lease-${randomUUID()}`,
      10
    );
    if (!providerLease.acquired) {
      await releaseUserLease(user.userId, userLease.leaseId!);
      throw new ApiError(
        ERROR_CODES.CONCURRENCY_LIMIT,
        'AI provider is busy.',
        429
      );
    }

    try {
      // 12. Get the latest generation for reference
      const previousGenerations = await generationRepo.findByDraftId(draft.id);
      const parentGenerationId = previousGenerations[0]?.id;

      // 13. Create new generation record
      const generation = await generationRepo.create({
        draftId: draft.id,
        ownerId: user.userId,
        status: 'pending',
        idempotencyKey: body.idempotencyKey ?? null,
        isRegen: true,
        parentGenerationId: parentGenerationId ?? null,
        regenType: body.regenType,
        metadata: JSON.stringify({
          variantCount: body.variantCount,
          changes: body.changes,
        }),
      });

      log.info({ generationId: generation.id }, 'Generation created');

      // 14. Set idempotency key if provided
      if (body.idempotencyKey) {
        await getOrSetIdempotency(
          'regenerate',
          body.idempotencyKey,
          user.userId,
          { draftId: draft.id, generationId: generation.id }
        );
      }

      // 15. Enqueue regeneration job
      const { enqueueGenerationJob } = await import('../../queue/enqueue.js');
      await enqueueWithRetry({
        type: 'generation',
        jobId: getRequestId(),
        userId: user.userId,
        draftId: draft.id,
        generationId: generation.id,
        lane: JOB_LANE.INTERACTIVE,
        variantCount: body.variantCount ?? 1,
        prompt: draft.prompt,
        platform: draft.platform,
        isRegen: true,
        parentGenerationId,
        regenType: body.regenType,
        regenChanges: body.changes,
        createdAt: new Date().toISOString(),
      });

      log.info({ generationId: generation.id }, 'Job enqueued');

      // 16. Return 202 Accepted
      return Response.json({
        success: true,
        data: {
          draftId: draft.id,
          generationId: generation.id,
          status: 'pending',
          regenType: body.regenType,
          estimatedWait: '30-60s',
        },
      }, {
        status: 202,
        headers: { 'X-Request-ID': requestId },
      });
    } catch (error) {
      await releaseUserLease(user.userId, userLease.leaseId!);
      await releaseProviderLease('minimax', 'video', JOB_LANE.INTERACTIVE, providerLease.leaseId!);
      throw error;
    }
  } catch (error) {
    log.error({ error }, 'Regenerate failed');
    return Response.json(
      {
        success: false,
        error: {
          code: error instanceof ApiError ? error.code : ERROR_CODES.INTERNAL_ERROR,
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      {
        status: error instanceof ApiError ? error.status : 500,
        headers: { 'X-Request-ID': requestId },
      }
    );
  }
}

/**
 * Release user lease helper
 */
async function releaseUserLease(userId: string, leaseId: string): Promise<void> {
  try {
    const { releaseUserConcurrency } = await import('../../enforcement/index.js');
    await releaseUserConcurrency(userId, leaseId);
  } catch (e) {
    // Ignore cleanup errors
  }
}

/**
 * Release provider lease helper
 */
async function releaseProviderLease(
  provider: string,
  model: string,
  lane: string,
  leaseId: string
): Promise<void> {
  try {
    const { releaseProviderConcurrency } = await import('../../enforcement/index.js');
    await releaseProviderConcurrency(provider, model, lane, leaseId);
  } catch (e) {
    // Ignore cleanup errors
  }
}
