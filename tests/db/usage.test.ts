/**
 * Unit tests for usage calculation and billing-related functions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  PLANS,
  getEffectiveLimits,
  resolveEffectivePlan,
  formatMonthKey,
  formatHourKey,
  secondsUntilMonthEnd,
  secondsUntilHourEnd,
} from '../../lib/billing/plans.js';
import { PLAN_TYPE } from '../../lib/db/schema.js';

describe('usage calculation', () => {
  describe('PLANS constants', () => {
    it('should have correct generation limits per plan', () => {
      expect(PLANS[PLAN_TYPE.BASIC].gensPerMonth).toBe(60);
      expect(PLANS[PLAN_TYPE.STANDARD].gensPerMonth).toBe(300);
      expect(PLANS[PLAN_TYPE.PRO].gensPerMonth).toBe(900);
    });

    it('should have correct variant limits per plan', () => {
      expect(PLANS[PLAN_TYPE.BASIC].maxVariants).toBe(1);
      expect(PLANS[PLAN_TYPE.STANDARD].maxVariants).toBe(3);
      expect(PLANS[PLAN_TYPE.PRO].maxVariants).toBe(5);
    });

    it('should have correct full regeneration settings', () => {
      expect(PLANS[PLAN_TYPE.BASIC].fullRegenAllowed).toBe(false);
      expect(PLANS[PLAN_TYPE.STANDARD].fullRegenAllowed).toBe(true);
      expect(PLANS[PLAN_TYPE.PRO].fullRegenAllowed).toBe(true);
    });

    it('should have correct full regeneration caps', () => {
      expect(PLANS[PLAN_TYPE.BASIC].fullRegenMonthlyCap).toBe(0);
      expect(PLANS[PLAN_TYPE.STANDARD].fullRegenMonthlyCap).toBe(10);
      expect(PLANS[PLAN_TYPE.PRO].fullRegenMonthlyCap).toBe(Infinity);
    });

    it('should have correct concurrency limits', () => {
      expect(PLANS[PLAN_TYPE.BASIC].userConcurrency).toBe(1);
      expect(PLANS[PLAN_TYPE.STANDARD].userConcurrency).toBe(2);
      expect(PLANS[PLAN_TYPE.PRO].userConcurrency).toBe(5);
    });
  });

  describe('resolveEffectivePlan', () => {
    it('should return base plan when boost is null', () => {
      expect(resolveEffectivePlan(PLAN_TYPE.BASIC, null)).toBe(PLAN_TYPE.BASIC);
    });

    it('should return base plan when boost is undefined', () => {
      expect(resolveEffectivePlan(PLAN_TYPE.BASIC, undefined)).toBe(PLAN_TYPE.BASIC);
    });

    it('should return base plan when boost is empty string', () => {
      expect(resolveEffectivePlan(PLAN_TYPE.BASIC, '')).toBe(PLAN_TYPE.BASIC);
    });

    it('should return PRO when boost is valid future date', () => {
      const futureDate = new Date(Date.now() + 86400000).toISOString();
      expect(resolveEffectivePlan(PLAN_TYPE.BASIC, futureDate)).toBe(PLAN_TYPE.PRO);
      expect(resolveEffectivePlan(PLAN_TYPE.STANDARD, futureDate)).toBe(PLAN_TYPE.PRO);
      expect(resolveEffectivePlan(PLAN_TYPE.PRO, futureDate)).toBe(PLAN_TYPE.PRO);
    });

    it('should return base plan when boost is expired', () => {
      const pastDate = new Date(Date.now() - 86400000).toISOString();
      expect(resolveEffectivePlan(PLAN_TYPE.BASIC, pastDate)).toBe(PLAN_TYPE.BASIC);
      expect(resolveEffectivePlan(PLAN_TYPE.STANDARD, pastDate)).toBe(PLAN_TYPE.STANDARD);
    });

    it('should return PRO when boost expires exactly now', () => {
      // Boost that just expired
      const justExpired = new Date(Date.now() - 1).toISOString();
      expect(resolveEffectivePlan(PLAN_TYPE.BASIC, justExpired)).toBe(PLAN_TYPE.BASIC);
    });
  });

  describe('getEffectiveLimits', () => {
    it('should return BASIC limits for BASIC plan with no boost', () => {
      const limits = getEffectiveLimits(PLAN_TYPE.BASIC);
      expect(limits.gensPerMonth).toBe(60);
      expect(limits.maxVariants).toBe(1);
    });

    it('should return PRO limits for BASIC plan with active boost', () => {
      const futureDate = new Date(Date.now() + 86400000).toISOString();
      const limits = getEffectiveLimits(PLAN_TYPE.BASIC, futureDate);
      expect(limits.gensPerMonth).toBe(900);
      expect(limits.maxVariants).toBe(5);
    });

    it('should return STANDARD limits for STANDARD plan', () => {
      const limits = getEffectiveLimits(PLAN_TYPE.STANDARD);
      expect(limits.gensPerMonth).toBe(300);
      expect(limits.maxVariants).toBe(3);
    });

    it('should return PRO limits for PRO plan', () => {
      const limits = getEffectiveLimits(PLAN_TYPE.PRO);
      expect(limits.gensPerMonth).toBe(900);
      expect(limits.maxVariants).toBe(5);
    });
  });

  describe('formatMonthKey', () => {
    it('should format current month correctly', () => {
      const key = formatMonthKey();
      expect(key).toMatch(/^\d{6}$/);
      expect(key.substring(0, 4)).toBe(String(new Date().getUTCFullYear()));
    });

    it('should format January correctly', () => {
      const jan2025 = new Date(Date.UTC(2025, 0, 15));
      expect(formatMonthKey(jan2025)).toBe('202501');
    });

    it('should format December correctly', () => {
      const dec2025 = new Date(Date.UTC(2025, 11, 1));
      expect(formatMonthKey(dec2025)).toBe('202512');
    });

    it('should pad single digit months with zero', () => {
      const may2025 = new Date(Date.UTC(2025, 4, 1));
      expect(formatMonthKey(may2025)).toBe('202505');
    });
  });

  describe('formatHourKey', () => {
    it('should format current hour correctly', () => {
      const key = formatHourKey();
      expect(key).toMatch(/^\d{10}$/);
    });

    it('should format specific hour correctly', () => {
      const date = new Date(Date.UTC(2025, 5, 15, 14, 30));
      expect(formatHourKey(date)).toBe('2025061514');
    });

    it('should pad single digit hours with zero', () => {
      const date = new Date(Date.UTC(2025, 5, 15, 9, 30));
      expect(formatHourKey(date)).toBe('2025061509');
    });

    it('should pad single digit days with zero', () => {
      const date = new Date(Date.UTC(2025, 0, 5, 12, 30));
      expect(formatHourKey(date)).toBe('2025010512');
    });
  });

  describe('secondsUntilMonthEnd', () => {
    it('should return positive value', () => {
      const seconds = secondsUntilMonthEnd();
      expect(seconds).toBeGreaterThan(0);
    });

    it('should return less than 31 days in seconds', () => {
      const seconds = secondsUntilMonthEnd();
      expect(seconds).toBeLessThan(31 * 24 * 60 * 60);
    });

    it('should return more than 0 seconds', () => {
      const seconds = secondsUntilMonthEnd();
      expect(seconds).toBeGreaterThan(0);
    });
  });

  describe('secondsUntilHourEnd', () => {
    it('should return positive value', () => {
      const seconds = secondsUntilHourEnd();
      expect(seconds).toBeGreaterThan(0);
    });

    it('should return less than or equal to 3600 seconds', () => {
      const seconds = secondsUntilHourEnd();
      expect(seconds).toBeLessThanOrEqual(3600);
    });

    it('should return more than 0 seconds', () => {
      const seconds = secondsUntilHourEnd();
      expect(seconds).toBeGreaterThan(0);
    });
  });
});
