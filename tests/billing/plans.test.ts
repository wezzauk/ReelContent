/**
 * Unit tests for billing/plans.ts
 */

import { describe, it, expect } from 'vitest';
import {
  PLANS,
  PLAN_PRICING,
  PRO_BOOST_PRICING,
  resolveEffectivePlan,
  getEffectiveLimits,
  formatMonthKey,
  formatHourKey,
  secondsUntilMonthEnd,
  secondsUntilHourEnd,
} from '../../lib/billing/plans.js';
import { PLAN_TYPE } from '../../lib/db/schema.js';

describe('billing/plans', () => {
  describe('PLANS', () => {
    it('should define Basic plan limits', () => {
      const basic = PLANS[PLAN_TYPE.BASIC];
      expect(basic.gensPerMonth).toBe(60);
      expect(basic.maxVariants).toBe(1);
      expect(basic.fullRegenAllowed).toBe(false);
      expect(basic.fullRegenMonthlyCap).toBe(0);
      expect(basic.userConcurrency).toBe(1);
    });

    it('should define Standard plan limits', () => {
      const standard = PLANS[PLAN_TYPE.STANDARD];
      expect(standard.gensPerMonth).toBe(300);
      expect(standard.maxVariants).toBe(3);
      expect(standard.fullRegenAllowed).toBe(true);
      expect(standard.fullRegenMonthlyCap).toBe(10);
      expect(standard.userConcurrency).toBe(2);
    });

    it('should define Pro plan limits', () => {
      const pro = PLANS[PLAN_TYPE.PRO];
      expect(pro.gensPerMonth).toBe(900);
      expect(pro.maxVariants).toBe(5);
      expect(pro.fullRegenAllowed).toBe(true);
      expect(pro.fullRegenMonthlyCap).toBe(Infinity);
      expect(pro.userConcurrency).toBe(5);
    });
  });

  describe('PLAN_PRICING', () => {
    it('should have correct prices', () => {
      expect(PLAN_PRICING[PLAN_TYPE.BASIC].price).toBe(5.95);
      expect(PLAN_PRICING[PLAN_TYPE.STANDARD].price).toBe(19.95);
      expect(PLAN_PRICING[PLAN_TYPE.PRO].price).toBe(39.95);
    });

    it('should have USD currency', () => {
      expect(PLAN_PRICING[PLAN_TYPE.BASIC].currency).toBe('USD');
    });
  });

  describe('PRO_BOOST_PRICING', () => {
    it('should have correct boost pricing', () => {
      expect(PRO_BOOST_PRICING.price).toBe(19.95);
      expect(PRO_BOOST_PRICING.durationDays).toBe(30);
    });
  });

  describe('resolveEffectivePlan', () => {
    it('should return base plan when no boost', () => {
      expect(resolveEffectivePlan(PLAN_TYPE.BASIC, null)).toBe(PLAN_TYPE.BASIC);
      expect(resolveEffectivePlan(PLAN_TYPE.BASIC, undefined)).toBe(PLAN_TYPE.BASIC);
    });

    it('should return base plan when boost is expired', () => {
      const expiredBoost = new Date(Date.now() - 86400000).toISOString(); // Yesterday
      expect(resolveEffectivePlan(PLAN_TYPE.BASIC, expiredBoost)).toBe(PLAN_TYPE.BASIC);
      expect(resolveEffectivePlan(PLAN_TYPE.STANDARD, expiredBoost)).toBe(PLAN_TYPE.STANDARD);
    });

    it('should return PRO when boost is active', () => {
      const futureBoost = new Date(Date.now() + 86400000).toISOString(); // Tomorrow
      expect(resolveEffectivePlan(PLAN_TYPE.BASIC, futureBoost)).toBe(PLAN_TYPE.PRO);
      expect(resolveEffectivePlan(PLAN_TYPE.STANDARD, futureBoost)).toBe(PLAN_TYPE.PRO);
      expect(resolveEffectivePlan(PLAN_TYPE.PRO, futureBoost)).toBe(PLAN_TYPE.PRO);
    });
  });

  describe('getEffectiveLimits', () => {
    it('should return base limits when no boost', () => {
      const limits = getEffectiveLimits(PLAN_TYPE.BASIC);
      expect(limits.gensPerMonth).toBe(60);
    });

    it('should return PRO limits when boost is active', () => {
      const futureBoost = new Date(Date.now() + 86400000).toISOString();
      const limits = getEffectiveLimits(PLAN_TYPE.BASIC, futureBoost);
      expect(limits.gensPerMonth).toBe(900);
      expect(limits.maxVariants).toBe(5);
      expect(limits.userConcurrency).toBe(5);
    });
  });

  describe('formatMonthKey', () => {
    it('should format current month correctly', () => {
      const key = formatMonthKey();
      expect(key).toMatch(/^\d{6}$/); // YYYYMM format
    });

    it('should format specific dates correctly', () => {
      const jan2025 = new Date(Date.UTC(2025, 0, 15)); // January 2025
      expect(formatMonthKey(jan2025)).toBe('202501');

      const dec2024 = new Date(Date.UTC(2024, 11, 1)); // December 2024
      expect(formatMonthKey(dec2024)).toBe('202412');
    });
  });

  describe('formatHourKey', () => {
    it('should format current hour correctly', () => {
      const key = formatHourKey();
      expect(key).toMatch(/^\d{10}$/); // YYYYMMDDHH format
    });

    it('should format specific hours correctly', () => {
      const specificDate = new Date(Date.UTC(2025, 0, 15, 14, 30));
      expect(formatHourKey(specificDate)).toBe('2025011514');
    });
  });

  describe('secondsUntilMonthEnd', () => {
    it('should return positive value', () => {
      const seconds = secondsUntilMonthEnd();
      expect(seconds).toBeGreaterThan(0);
    });

    it('should return reasonable range (1-31 days in seconds)', () => {
      const seconds = secondsUntilMonthEnd();
      expect(seconds).toBeLessThan(31 * 24 * 60 * 60 + 1000);
      expect(seconds).toBeGreaterThan(0);
    });
  });

  describe('secondsUntilHourEnd', () => {
    it('should return positive value', () => {
      const seconds = secondsUntilHourEnd();
      expect(seconds).toBeGreaterThan(0);
    });

    it('should return less than 3600 seconds (1 hour)', () => {
      const seconds = secondsUntilHourEnd();
      expect(seconds).toBeLessThanOrEqual(3600);
    });
  });
});
