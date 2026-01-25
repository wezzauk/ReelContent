/**
 * Create Generation Handler
 *
 * Handles POST /v1/create - Creates a new generation request.
 *
 * Flow:
 * 1. Authenticate user
 * 2. Validate request body
 * 3. Check idempotency key
 * 4. Resolve effective plan limits
 * 5. Enforce monthly pool + hourly burst limits
 * 6. Acquire user + provider concurrency leases
 * 7. Create draft + generation DB records
 * 8. Enqueue generation job
 * 9. Return 202 Accepted
 */

import { randomUUID } from 'node:crypto';
import { ApiError, ERROR_CODES } from '../../security/errors';
import { getUserFromHeader } from '../../security/auth';
import { validateBody } from '../../security/validation';
import {
  createSchema,
  type CreateRequest,
} from '../schemas/requests';
import {
  draftRepo,
  generationRepo,
  subscriptionRepo,
  boostRepo,
} from '../../db/repositories';
import {
  enforceMonthlyPool,
  enforceHourlyBurst,
  acquireUserConcurrency,
  acquireProviderConcurrency,
  getOrSetIdempotency,
} from '../../enforcement/index';
import { getEffectiveLimits } from '../../billing/plans';
import { enqueueWithRetry, JOB_LANE, createGenerationJob } from '../../queue/index';
import { logger, getRequestId, setRequestId, trackLimitRejection, LIMIT_REJECTION_TYPES, logLifecycleEvent, LIFECYCLE_EVENTS } from '../../observability/index';

/**
 * Extract or generate request ID from request headers
 */
function getRequestIdFromRequest(request: Request): string {
  const headerId = request.headers.get('x-request-id');
  if (headerId) return headerId;
  return randomUUID();
}

/**
 * Handle POST /v1/create
 */
export async function handleCreate(request: Request): Promise<Response> {
  const requestId = getRequestIdFromRequest(request);
  setRequestId(requestId);
  const log = logger.child({ requestId, handler: 'create' });

  try {
    // 1. Authenticate
    const user = await getUserFromHeader(request.headers.get('authorization'));
    if (!user) {
      throw new ApiError(ERROR_CODES.UNAUTHORIZED, 'Authentication required', 401);
    }

    log.info({ userId: user.userId }, 'User authenticated');

    // 2. Validate request body
    const body = await validateBody(request, createSchema);
    log.info({ body: { ...body, prompt: '[REDACTED]' } }, 'Request validated');

    // 3. Check idempotency (if provided)
    if (body.idempotencyKey) {
      const existing = await generationRepo.findByIdemKey(body.idempotencyKey);
      if (existing) {
        log.warn({ idempotencyKey: body.idempotencyKey }, 'Duplicate request detected');
        return Response.json({
          success: true,
          data: {
            draftId: existing.draftId,
            generationId: existing.id,
            duplicated: true,
          },
        }, { status: 200 });
      }
    }

    // 4. Resolve effective plan limits
    const subscription = await subscriptionRepo.findByUserId(user.userId);
    const boost = await boostRepo.findActiveByUserId(user.userId);
    const limits = getEffectiveLimits(
      subscription?.plan ?? 'basic',
      boost?.expiresAt?.toISOString()
    );

    log.info({ plan: subscription?.plan, isBoosted: !!boost, limits }, 'Effective limits resolved');

    // 5. Enforce monthly pool
    const monthlyResult = await enforceMonthlyPool(user.userId, limits.gensPerMonth);
    if (!monthlyResult.success) {
      trackLimitRejection(LIMIT_REJECTION_TYPES.MONTHLY_LIMIT, user.userId, {
        limit: limits.gensPerMonth,
        remaining: monthlyResult.remaining,
      });
      log.warn({ used: limits.gensPerMonth - (monthlyResult.remaining ?? 0) }, 'Monthly limit exceeded');
      throw new ApiError(
        ERROR_CODES.QUOTA_EXCEEDED,
        `Monthly generation limit reached (${limits.gensPerMonth} per month). Upgrade your plan for more.`,
        403
      );
    }

    // 6. Enforce hourly burst
    const burstResult = await enforceHourlyBurst(user.userId);
    if (!burstResult.success) {
      trackLimitRejection(LIMIT_REJECTION_TYPES.HOURLY_LIMIT, user.userId, {
        remaining: burstResult.remaining,
      });
      log.warn({}, 'Hourly burst limit exceeded');
      throw new ApiError(
        ERROR_CODES.RATE_LIMITED,
        'Hourly request limit exceeded. Please try again later.',
        429
      );
    }

    // 7. Acquire user concurrency lease
    const userLease = await acquireUserConcurrency(
      user.userId,
      'pending',
      limits.userConcurrency
    );
    if (!userLease.acquired) {
      trackLimitRejection(LIMIT_REJECTION_TYPES.CONCURRENCY_LIMIT, user.userId, {
        concurrency: limits.userConcurrency,
      });
      log.warn({ concurrency: limits.userConcurrency }, 'User concurrency limit exceeded');
      throw new ApiError(
        ERROR_CODES.CONCURRENCY_LIMIT,
        'Too many concurrent generations. Please wait for current jobs to complete.',
        429
      );
    }

    // 8. Acquire provider concurrency lease
    const providerLease = await acquireProviderConcurrency(
      'minimax',
      'video',
      JOB_LANE.INTERACTIVE,
      `lease-${randomUUID()}`,
      10 // Provider limit
    );
    if (!providerLease.acquired) {
      // Release user lease on failure
      await releaseUserLease(user.userId, userLease.leaseId!);
      trackLimitRejection(LIMIT_REJECTION_TYPES.PROVIDER_CONCURRENCY, user.userId, {
        provider: 'minimax',
        model: 'video',
        lane: JOB_LANE.INTERACTIVE,
      });
      throw new ApiError(
        ERROR_CODES.CONCURRENCY_LIMIT,
        'AI provider is busy. Please try again in a moment.',
        429
      );
    }

    try {
      // 9. Create draft record
      const draft = await draftRepo.create({
        ownerId: user.userId,
        title: body.title ?? null,
        prompt: body.prompt,
        platform: body.platform,
        settings: '{}',
      });

      log.info({ draftId: draft.id }, 'Draft created');

      // 10. Create generation record
      const generation = await generationRepo.create({
        draftId: draft.id,
        ownerId: user.userId,
        status: 'pending',
        idempotencyKey: body.idempotencyKey ?? null,
        isRegen: false,
        metadata: JSON.stringify({ variantCount: body.variantCount }),
      });

      log.info({ generationId: generation.id }, 'Generation created');

      // 11. Set idempotency key if provided
      if (body.idempotencyKey) {
        await getOrSetIdempotency(
          'create',
          body.idempotencyKey,
          user.userId,
          { draftId: draft.id, generationId: generation.id }
        );
      }

      // 12. Enqueue generation job
      const { enqueueWithRetry: enqueue, JOB_LANE: LANE } = await import('../../queue/index');
      const job = createGenerationJob({
        userId: user.userId,
        draftId: draft.id,
        generationId: generation.id,
        lane: LANE.INTERACTIVE,
        variantCount: body.variantCount ?? 1,
        prompt: body.prompt,
        platform: body.platform,
        isRegen: false,
        userLeaseId: userLease.leaseId,
        providerLeaseId: providerLease.leaseId,
      });
      await enqueue(job);

      // Log lifecycle event for tracking
      logLifecycleEvent(LIFECYCLE_EVENTS.QUEUED, generation.id, requestId, {
        userId: user.userId,
        draftId: draft.id,
        variantCount: body.variantCount ?? 1,
        platform: body.platform,
      });

      log.info({ generationId: generation.id }, 'Job enqueued');

      // 13. Return 202 Accepted
      return Response.json({
        success: true,
        data: {
          draftId: draft.id,
          generationId: generation.id,
          status: 'pending',
          estimatedWait: '30-60s',
        },
      }, {
        status: 202,
        headers: {
          'X-Request-ID': requestId,
        },
      });
    } catch (error) {
      // Cleanup on failure - release leases
      await releaseUserLease(user.userId, userLease.leaseId!);
      await releaseProviderLease('minimax', 'video', JOB_LANE.INTERACTIVE, providerLease.leaseId!);
      throw error;
    }
  } catch (error) {
    log.error({ error }, 'Create failed');
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
    const { releaseUserConcurrency } = await import('../../enforcement/index');
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
    const { releaseProviderConcurrency } = await import('../../enforcement/index');
    await releaseProviderConcurrency(provider, model, lane, leaseId);
  } catch (e) {
    // Ignore cleanup errors
  }
}
