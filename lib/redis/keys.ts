/**
 * Redis key builders - canonical key patterns
 *
 * Provides pure functions for generating consistent Redis key names.
 * All keys use the 'app:' prefix to avoid collisions.
 */

import { formatMonthKey, formatHourKey } from '../billing/plans';

/**
 * Namespace for all app keys
 */
const KEY_PREFIX = 'app';

/**
 * User ID placeholder for documentation
 */
type UserId = string;

/**
 * Generate a prefixed key
 */
function prefix(...parts: string[]): string {
  return [KEY_PREFIX, ...parts].join(':');
}

/**
 * Usage key - monthly generation usage counter
 *
 * Pattern: app:usage:{u}:gen_used:{yyyymm}
 * Example: app:usage:user123:gen_used:202501
 */
export function usageKey(userId: UserId, monthKey?: string): string {
  return prefix('usage', userId, 'gen_used', monthKey ?? formatMonthKey());
}

/**
 * Burst key - hourly generation burst counter
 *
 * Pattern: app:burst:{u}:gen_hour:{yyyymmddhh}
 * Example: app:burst:user123:gen_hour:2025012414
 */
export function burstKey(userId: UserId, hourKey?: string): string {
  return prefix('burst', userId, 'gen_hour', hourKey ?? formatHourKey());
}

/**
 * Full regeneration usage key - tracks full regeneration count per month
 *
 * Pattern: app:usage:{u}:full_regen_used:{yyyymm}
 * Example: app:usage:user123:full_regen_used:202501
 */
export function fullRegenKey(userId: UserId, monthKey?: string): string {
  return prefix('usage', userId, 'full_regen_used', monthKey ?? formatMonthKey());
}

/**
 * Regeneration cooldown key - prevents rapid regens on same draft
 *
 * Pattern: app:cooldown:{u}:regen:{draft_id}
 * Example: app:cooldown:user123:regen:abc123
 */
export function regenCooldownKey(userId: UserId, draftId: string): string {
  return prefix('cooldown', userId, 'regen', draftId);
}

/**
 * User concurrency leases set - tracks active leases for a user
 *
 * Pattern: app:conc:{u}:leases
 * Example: app:conc:user123:leases
 */
export function userLeasesKey(userId: UserId): string {
  return prefix('conc', userId, 'leases');
}

/**
 * Individual lease tracking key
 *
 * Pattern: app:conc:lease:{lease_id}
 * Example: app:conc:lease:lease-abc123
 */
export function leaseKey(leaseId: string): string {
  return prefix('conc', 'lease', leaseId);
}

/**
 * Provider concurrency semaphore - limits concurrent calls to AI provider
 *
 * Pattern: app:conc:provider:{provider}:{model}:{lane}
 * Example: app:conc:provider:minimax:video:interactive
 */
export function providerConcurrencyKey(provider: string, model: string, lane: string): string {
  return prefix('conc', 'provider', provider, model, lane);
}

/**
 * Idempotency key - stores result of an idempotent operation
 *
 * Pattern: app:idem:{u}:{scope}:{key}
 * Example: app:idem:user123:create:abc123-def456
 */
export function idempotencyKey(userId: UserId, scope: string, key: string): string {
  return prefix('idem', userId, scope, key);
}

/**
 * User effective plan cache - cached resolved plan for a user
 *
 * Pattern: app:user:{u}:plan_effective
 * Example: app:user:user123:plan_effective
 */
export function userPlanKey(userId: UserId): string {
  return prefix('user', userId, 'plan_effective');
}

/**
 * User Pro Boost expiration cache
 *
 * Pattern: app:boost:{u}:pro_until
 * Example: app:boost:user123:pro_until
 */
export function userBoostKey(userId: UserId): string {
  return prefix('boost', userId, 'pro_until');
}

/**
 * Generation tracking key - marks a generation as in progress
 *
 * Pattern: app:gen:{generation_id}:in_progress
 * Example: app:gen:abc123:in_progress
 */
export function generationInProgressKey(generationId: string): string {
  return prefix('gen', generationId, 'in_progress');
}

/**
 * All key builder functions for export
 */
export const keys = {
  usage: usageKey,
  burst: burstKey,
  fullRegen: fullRegenKey,
  regenCooldown: regenCooldownKey,
  userLeases: userLeasesKey,
  lease: leaseKey,
  providerConcurrency: providerConcurrencyKey,
  idempotency: idempotencyKey,
  userPlan: userPlanKey,
  userBoost: userBoostKey,
  generationInProgress: generationInProgressKey,
};

/**
 * TTL configurations for different key types (in seconds)
 */
export const TTL_CONFIG = {
  /** TTL for usage counters (reset at month end) */
  USAGE: null, // Set dynamically based on time until month end
  /** TTL for burst counters (reset at hour end) */
  BURST: null, // Set dynamically based on time until hour end
  /** Cooldown duration in seconds (5 minutes) */
  REGEN_COOLDOWN: 300,
  /** Lease TTL (30 minutes - generous for job processing) */
  LEASE: 1800,
  /** Plan cache TTL (10 minutes) */
  PLAN_CACHE: 600,
  /** Boost cache TTL (5 minutes) */
  BOOST_CACHE: 300,
  /** Idempotency result TTL (24 hours) */
  IDEMPOTENCY: 86400,
  /** In-progress marker TTL (2 hours) */
  IN_PROGRESS: 7200,
} as const;
