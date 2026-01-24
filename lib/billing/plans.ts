/**
 * Billing module - plan constants and effective plan resolution
 *
 * Defines all plan limits, pricing, and provides functions to resolve
 * effective limits based on base plan and active Pro Boost.
 */

import { PLAN_TYPE, type PlanType } from '../db/schema.js';

// Re-export PlanType for convenience
export type { PlanType } from '../db/schema.js';

/**
 * Provider concurrency limit (per lane)
 */
export const PROVIDER_CONCURRENCY_LIMIT = 10;

/**
 * Plan limits as defined in the spec (M2)
 */
export interface PlanLimits {
  /** Monthly generation quota */
  gensPerMonth: number;
  /** Maximum variants per generation */
  maxVariants: number;
  /** Whether full regeneration is allowed */
  fullRegenAllowed: boolean;
  /** Monthly cap on full regenerations (if applicable) */
  fullRegenMonthlyCap: number;
  /** User concurrency limit */
  userConcurrency: number;
}

/**
 * Plan configuration - source of truth for all plan limits
 */
export const PLANS: Record<PlanType, PlanLimits> = {
  [PLAN_TYPE.BASIC]: {
    gensPerMonth: 60,
    maxVariants: 1,
    fullRegenAllowed: false,
    fullRegenMonthlyCap: 0,
    userConcurrency: 1,
  },
  [PLAN_TYPE.STANDARD]: {
    gensPerMonth: 300,
    maxVariants: 3,
    fullRegenAllowed: true,
    fullRegenMonthlyCap: 10,
    userConcurrency: 2,
  },
  [PLAN_TYPE.PRO]: {
    gensPerMonth: 900,
    maxVariants: 5,
    fullRegenAllowed: true,
    fullRegenMonthlyCap: Infinity, // No cap
    userConcurrency: 5,
  },
};

/**
 * Plan pricing (for reference/metadata purposes)
 */
export const PLAN_PRICING: Record<PlanType, { price: number; currency: string }> = {
  [PLAN_TYPE.BASIC]: { price: 5.95, currency: 'USD' },
  [PLAN_TYPE.STANDARD]: { price: 19.95, currency: 'USD' },
  [PLAN_TYPE.PRO]: { price: 39.95, currency: 'USD' },
};

/**
 * Pro Boost configuration
 */
export const PRO_BOOST_PRICING = { price: 19.95, currency: 'USD', durationDays: 30 };

/**
 * Resolve effective plan based on base plan and active Pro Boost
 *
 * When a user has an active Pro Boost, their effective plan becomes Pro
 * regardless of their base subscription plan.
 *
 * @param basePlan - The user's base subscription plan
 * @param boostExpiresAt - Optional boost expiration timestamp (ISO string)
 * @returns The effective plan type
 */
export function resolveEffectivePlan(
  basePlan: PlanType,
  boostExpiresAt?: string | null
): PlanType {
  // If no boost or expired, return base plan
  if (!boostExpiresAt) {
    return basePlan;
  }

  const now = new Date();
  const expiry = new Date(boostExpiresAt);

  if (now < expiry) {
    // Active boost - effective plan is Pro
    return PLAN_TYPE.PRO;
  }

  return basePlan;
}

/**
 * Get effective limits for a user based on their plan and boost status
 *
 * @param basePlan - The user's base subscription plan
 * @param boostExpiresAt - Optional boost expiration timestamp (ISO string)
 * @returns The effective plan limits
 */
export function getEffectiveLimits(
  basePlan: PlanType,
  boostExpiresAt?: string | null
): PlanLimits {
  const effectivePlan = resolveEffectivePlan(basePlan, boostExpiresAt);
  return PLANS[effectivePlan];
}

/**
 * Format month key for Redis usage tracking (YYYYMM format)
 *
 * @param date - Date to format (defaults to current UTC month)
 * @returns Month key string
 */
export function formatMonthKey(date: Date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}${month}`;
}

/**
 * Format hour key for Redis burst tracking (YYYYMMMDDHH format)
 *
 * @param date - Date to format (defaults to current UTC hour)
 * @returns Hour key string
 */
export function formatHourKey(date: Date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hour = String(date.getUTCHours()).padStart(2, '0');
  return `${year}${month}${day}${hour}`;
}

/**
 * Calculate seconds until the end of the current UTC month
 *
 * @returns Seconds until month end
 */
export function secondsUntilMonthEnd(): number {
  const now = new Date();
  const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return Math.floor((nextMonth.getTime() - now.getTime()) / 1000);
}

/**
 * Calculate seconds until the end of the current UTC hour
 *
 * @returns Seconds until hour end
 */
export function secondsUntilHourEnd(): number {
  const now = new Date();
  const nextHour = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours() + 1));
  return Math.floor((nextHour.getTime() - now.getTime()) / 1000);
}
