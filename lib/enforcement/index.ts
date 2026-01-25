/**
 * Enforcement wrappers - atomic limit enforcement using Redis Lua scripts
 *
 * Provides thin wrappers around Lua scripts for:
 * - Monthly generation pool enforcement
 * - Hourly burst limit enforcement
 * - Full regeneration cap enforcement
 * - User concurrency semaphore
 * - Provider concurrency semaphore
 * - Regeneration cooldown
 * - Idempotency operations
 */

import { randomUUID } from 'node:crypto';
import { redis, type EnforcementResult, type SemaphoreResult, type IdempotencyResult } from '../redis/client';
import {
  keys,
  TTL_CONFIG,
  usageKey,
  burstKey,
  fullRegenKey,
  regenCooldownKey,
  userLeasesKey,
  leaseKey,
  providerConcurrencyKey,
  idempotencyKey,
} from '../redis/keys';
import {
  secondsUntilMonthEnd,
  secondsUntilHourEnd,
  formatMonthKey,
  formatHourKey,
} from '../billing/plans';
import { LuaScripts, getScript } from '../redis/lua/loader';

/**
 * Default burst limit per hour (applied to all plans)
 */
const DEFAULT_BURST_LIMIT = 10;

/**
 * Default cooldown for regeneration in seconds (5 minutes)
 */
const REGEN_COOLDOWN_SECONDS = 300;

/**
 * Lease metadata interface
 */
interface LeaseMetadata {
  userId: string;
  generationId?: string;
  createdAt: string;
  expiresAt: string;
}

/**
 * Enforce monthly generation pool limit
 *
 * @param userId - User ID
 * @param limit - Maximum generations allowed this month
 * @param increment - Amount to increment (default 1)
 * @returns EnforcementResult with success status and remaining count
 */
export async function enforceMonthlyPool(
  userId: string,
  limit: number,
  increment: number = 1
): Promise<EnforcementResult> {
  const script = getScript(LuaScripts.COUNTER_WITH_LIMIT);
  if (!script) {
    throw new Error('counter_with_limit script not loaded');
  }

  const key = usageKey(userId);
  const ttl = secondsUntilMonthEnd();

  try {
    const result = await redis.evalsha(
      script.sha,
      [key],
      [increment, limit, ttl]
    ) as [number, number, number];

    const [allowed, count, remaining] = result;

    return {
      success: allowed === 1,
      remaining: remaining >= 0 ? remaining : 0,
      message: allowed === 1
        ? 'Monthly usage incremented'
        : `Monthly limit reached (${count}/${limit})`,
    };
  } catch (error) {
    throw new Error(`Failed to enforce monthly pool: ${error}`);
  }
}

/**
 * Enforce hourly burst limit
 *
 * @param userId - User ID
 * @param limit - Maximum generations allowed this hour
 * @param increment - Amount to increment (default 1)
 * @returns EnforcementResult with success status and remaining count
 */
export async function enforceHourlyBurst(
  userId: string,
  limit: number = DEFAULT_BURST_LIMIT,
  increment: number = 1
): Promise<EnforcementResult> {
  const script = getScript(LuaScripts.COUNTER_WITH_LIMIT);
  if (!script) {
    throw new Error('counter_with_limit script not loaded');
  }

  const key = burstKey(userId);
  const ttl = secondsUntilHourEnd();

  try {
    const result = await redis.evalsha(
      script.sha,
      [key],
      [increment, limit, ttl]
    ) as [number, number, number];

    const [allowed, count, remaining] = result;

    return {
      success: allowed === 1,
      remaining: remaining >= 0 ? remaining : 0,
      retryAfter: allowed === 0 ? ttl : undefined,
      message: allowed === 1
        ? 'Burst usage incremented'
        : `Hourly burst limit reached (${count}/${limit})`,
    };
  } catch (error) {
    throw new Error(`Failed to enforce hourly burst: ${error}`);
  }
}

/**
 * Check and enforce full regeneration monthly cap
 *
 * @param userId - User ID
 * @param limit - Maximum full regenerations allowed this month
 * @returns EnforcementResult with success status
 */
export async function enforceFullRegenCap(
  userId: string,
  limit: number
): Promise<EnforcementResult> {
  const script = getScript(LuaScripts.COUNTER_WITH_LIMIT);
  if (!script) {
    throw new Error('counter_with_limit script not loaded');
  }

  const key = fullRegenKey(userId);
  const ttl = secondsUntilMonthEnd();

  try {
    const result = await redis.evalsha(
      script.sha,
      [key],
      [1, limit, ttl]
    ) as [number, number, number];

    const [allowed, count, remaining] = result;

    return {
      success: allowed === 1,
      remaining: remaining >= 0 ? remaining : 0,
      message: allowed === 1
        ? 'Full regeneration allowed'
        : `Full regeneration cap reached (${count}/${limit})`,
    };
  } catch (error) {
    throw new Error(`Failed to enforce full regen cap: ${error}`);
  }
}

/**
 * Acquire a user concurrency lease
 *
 * @param userId - User ID
 * @param generationId - Generation ID (for tracking)
 * @param maxLeases - Maximum concurrent leases allowed
 * @returns SemaphoreResult with lease ID if acquired
 */
export async function acquireUserConcurrency(
  userId: string,
  generationId: string,
  maxLeases: number
): Promise<SemaphoreResult> {
  const script = getScript(LuaScripts.SEMAPHORE_ACQUIRE);
  if (!script) {
    throw new Error('semaphore_acquire script not loaded');
  }

  const leaseId = `lease-${randomUUID()}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TTL_CONFIG.LEASE * 1000);

  const metadata: LeaseMetadata = {
    userId,
    generationId,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };

  const leasesKey = userLeasesKey(userId);

  try {
    const result = await redis.evalsha(
      script.sha,
      [leasesKey, leasesKey],
      [leaseId, JSON.stringify(metadata), maxLeases, TTL_CONFIG.LEASE]
    ) as [number, string | null, string, number];

    const [acquired, id, status, retryAfter] = result;

    return {
      acquired: acquired === 1,
      leaseId: acquired === 1 ? leaseId : undefined,
      message: status,
      retryAfter: retryAfter > 0 ? retryAfter : undefined,
    };
  } catch (error) {
    throw new Error(`Failed to acquire user concurrency: ${error}`);
  }
}

/**
 * Release a user concurrency lease
 *
 * @param userId - User ID
 * @param leaseId - Lease ID to release
 * @returns SemaphoreResult with release status
 */
export async function releaseUserConcurrency(
  userId: string,
  leaseId: string
): Promise<SemaphoreResult> {
  const script = getScript(LuaScripts.SEMAPHORE_RELEASE);
  if (!script) {
    throw new Error('semaphore_release script not loaded');
  }

  const leasesKey = userLeasesKey(userId);

  try {
    const result = await redis.evalsha(
      script.sha,
      [leasesKey, leasesKey],
      [leaseId]
    ) as [number, string];

    const [released, status] = result;

    return {
      acquired: released === 1,
      message: status,
    };
  } catch (error) {
    throw new Error(`Failed to release user concurrency: ${error}`);
  }
}

/**
 * Acquire a provider concurrency lease
 *
 * @param provider - Provider name (e.g., 'minimax')
 * @param model - Model name (e.g., 'video')
 * @param lane - Lane name (e.g., 'interactive')
 * @param leaseId - Unique lease identifier
 * @param maxLeases - Maximum concurrent leases allowed
 * @returns SemaphoreResult with acquisition status
 */
export async function acquireProviderConcurrency(
  provider: string,
  model: string,
  lane: string,
  leaseId: string,
  maxLeases: number
): Promise<SemaphoreResult> {
  const script = getScript(LuaScripts.SEMAPHORE_ACQUIRE);
  if (!script) {
    throw new Error('semaphore_acquire script not loaded');
  }

  const concKey = providerConcurrencyKey(provider, model, lane);

  try {
    const result = await redis.evalsha(
      script.sha,
      [concKey, concKey],
      [leaseId, '{}', maxLeases, TTL_CONFIG.LEASE]
    ) as [number, string | null, string, number];

    const [acquired, , status, retryAfter] = result;

    return {
      acquired: acquired === 1,
      leaseId: acquired === 1 ? leaseId : undefined,
      message: status,
      retryAfter: retryAfter > 0 ? retryAfter : undefined,
    };
  } catch (error) {
    throw new Error(`Failed to acquire provider concurrency: ${error}`);
  }
}

/**
 * Release a provider concurrency lease
 *
 * @param provider - Provider name
 * @param model - Model name
 * @param lane - Lane name
 * @param leaseId - Lease ID to release
 * @returns SemaphoreResult with release status
 */
export async function releaseProviderConcurrency(
  provider: string,
  model: string,
  lane: string,
  leaseId: string
): Promise<SemaphoreResult> {
  const script = getScript(LuaScripts.SEMAPHORE_RELEASE);
  if (!script) {
    throw new Error('semaphore_release script not loaded');
  }

  const concKey = providerConcurrencyKey(provider, model, lane);

  try {
    const result = await redis.evalsha(
      script.sha,
      [concKey, concKey],
      [leaseId]
    ) as [number, string];

    const [released, status] = result;

    return {
      acquired: released === 1,
      message: status,
    };
  } catch (error) {
    throw new Error(`Failed to release provider concurrency: ${error}`);
  }
}

/**
 * Check and set regeneration cooldown
 *
 * @param userId - User ID
 * @param draftId - Draft ID being regenerated
 * @returns Result indicating if cooldown was set or is active
 */
export async function checkAndSetRegenCooldown(
  userId: string,
  draftId: string
): Promise<{ allowed: boolean; ttlRemaining: number }> {
  const script = getScript(LuaScripts.CHECK_AND_SET_COOLDOWN);
  if (!script) {
    throw new Error('check_and_set_cooldown script not loaded');
  }

  const key = regenCooldownKey(userId, draftId);

  try {
    const result = await redis.evalsha(
      script.sha,
      [key],
      [REGEN_COOLDOWN_SECONDS, `${userId}:${draftId}`]
    ) as [number, string, number];

    const [set, status, ttl] = result;

    return {
      allowed: set === 1,
      ttlRemaining: ttl,
    };
  } catch (error) {
    throw new Error(`Failed to check regen cooldown: ${error}`);
  }
}

/**
 * Get or set an idempotency key
 *
 * @param scope - Idempotency scope (e.g., 'create', 'regen')
 * @param key - Unique key for this operation
 * @param userId - User ID
 * @param value - Value to store on first call
 * @returns IdempotencyResult with isFirst flag and value
 */
export async function getOrSetIdempotency<T>(
  scope: string,
  key: string,
  userId: string,
  value: T
): Promise<IdempotencyResult<T>> {
  const script = getScript(LuaScripts.IDEMPOTENCY_GET_SET);
  if (!script) {
    throw new Error('idempotency_get_set script not loaded');
  }

  const idempKey = idempotencyKey(userId, scope, key);
  const serializedValue = JSON.stringify(value);

  try {
    const result = await redis.evalsha(
      script.sha,
      [idempKey],
      [serializedValue, TTL_CONFIG.IDEMPOTENCY]
    ) as [number, string, string];

    const [isFirst, status, storedValue] = result;

    return {
      isFirst: isFirst === 1,
      value: isFirst === 1 ? value : JSON.parse(storedValue),
    };
  } catch (error) {
    throw new Error(`Failed to check idempotency: ${error}`);
  }
}

/**
 * Get current monthly usage for a user (for reporting)
 *
 * @param userId - User ID
 * @param monthKey - Optional month key (defaults to current)
 * @returns Current usage count
 */
export async function getMonthlyUsage(userId: string, monthKey?: string): Promise<number> {
  const key = usageKey(userId, monthKey);
  const count = await redis.get<number>(key);
  return count ?? 0;
}

/**
 * Get current hourly burst usage for a user (for reporting)
 *
 * @param userId - User ID
 * @param hourKey - Optional hour key (defaults to current)
 * @returns Current burst count
 */
export async function getHourlyUsage(userId: string, hourKey?: string): Promise<number> {
  const key = burstKey(userId, hourKey);
  const count = await redis.get<number>(key);
  return count ?? 0;
}

/**
 * Get current full regeneration count for a user (for reporting)
 *
 * @param userId - User ID
 * @param monthKey - Optional month key (defaults to current)
 * @returns Current full regen count
 */
export async function getFullRegenUsage(userId: string, monthKey?: string): Promise<number> {
  const key = fullRegenKey(userId, monthKey);
  const count = await redis.get<number>(key);
  return count ?? 0;
}

/**
 * Get current user concurrency count
 *
 * @param userId - User ID
 * @returns Current lease count
 */
export async function getUserConcurrencyCount(userId: string): Promise<number> {
  const key = userLeasesKey(userId);
  return await redis.scard(key);
}

/**
 * Get current provider concurrency count
 *
 * @param provider - Provider name
 * @param model - Model name
 * @param lane - Lane name
 * @returns Current lease count
 */
export async function getProviderConcurrencyCount(
  provider: string,
  model: string,
  lane: string
): Promise<number> {
  const key = providerConcurrencyKey(provider, model, lane);
  return await redis.scard(key);
}
