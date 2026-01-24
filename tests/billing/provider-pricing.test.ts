/**
 * Unit tests for billing provider pricing module
 */

import { describe, it, expect } from 'vitest';
import {
  calculateCost,
  calculateCostFromUsage,
  getModelPricing,
  formatMonthKeyForLedger,
  HARD_CAPS,
  getHardCapsForPlan,
  MODEL_PRICING,
} from '../../lib/billing/provider-pricing.js';

describe('provider-pricing', () => {
  describe('getModelPricing', () => {
    it('should return pricing for known models', () => {
      const pricing = getModelPricing('gpt-4o-mini');
      expect(pricing).toBeDefined();
      expect(pricing?.provider).toBe('openai');
      expect(pricing?.model).toBe('gpt-4o-mini');
    });

    it('should return undefined for unknown models', () => {
      const pricing = getModelPricing('unknown-model');
      expect(pricing).toBeUndefined();
    });

    it('should have pricing for all configured models', () => {
      MODEL_PRICING.forEach((p) => {
        const found = getModelPricing(p.model);
        expect(found).toBeDefined();
        expect(found?.provider).toBe(p.provider);
      });
    });
  });

  describe('calculateCost', () => {
    it('should calculate cost for gpt-4o-mini', () => {
      // gpt-4o-mini: $0.10 per 1M input, $0.40 per 1M output
      const cost = calculateCost('gpt-4o-mini', 1000, 2000);
      // Input: 1000/1M * $0.10 = $0.0001
      // Output: 2000/1M * $0.40 = $0.0008
      // Total: $0.0009
      expect(cost).toBeCloseTo(0.0009, 6);
    });

    it('should calculate cost for gpt-4.1-mini', () => {
      // gpt-4.1-mini: $0.10 per 1M input, $0.40 per 1M output
      const cost = calculateCost('gpt-4.1-mini', 500, 1500);
      // Input: 500/1M * $0.10 = $0.00005
      // Output: 1500/1M * $0.40 = $0.0006
      // Total: $0.00065
      expect(cost).toBeCloseTo(0.00065, 6);
    });

    it('should calculate cost for anthropic models', () => {
      // claude-haiku-3: $0.25 per 1M input, $1.25 per 1M output
      const cost = calculateCost('claude-haiku-3-20250514', 1000, 1000);
      // Input: 1000/1M * $0.25 = $0.00025
      // Output: 1000/1M * $1.25 = $0.00125
      // Total: $0.0015
      expect(cost).toBeCloseTo(0.0015, 6);
    });

    it('should use fallback pricing for unknown models', () => {
      const cost = calculateCost('unknown-model', 1000, 1000);
      // Fallback: $0.50 per 1M tokens = $0.0005 per token
      // Total: 2000 * $0.0005 / 1M = $0.001
      expect(cost).toBe(0.001);
    });

    it('should handle zero tokens', () => {
      const cost = calculateCost('gpt-4o-mini', 0, 0);
      expect(cost).toBe(0);
    });

    it('should handle large token counts', () => {
      const cost = calculateCost('gpt-4o-mini', 1000000, 1000000);
      // Input: 1M * $0.10 = $0.10
      // Output: 1M * $0.40 = $0.40
      // Total: $0.50
      expect(cost).toBe(0.5);
    });
  });

  describe('calculateCostFromUsage', () => {
    it('should calculate cost from usage object', () => {
      const cost = calculateCostFromUsage('gpt-4o-mini', {
        inputTokens: 1000,
        outputTokens: 2000,
      });
      expect(cost).toBeCloseTo(0.0009, 6);
    });

    it('should handle undefined tokens', () => {
      const cost = calculateCostFromUsage('gpt-4o-mini', {
        inputTokens: undefined,
        outputTokens: undefined,
      });
      expect(cost).toBe(0);
    });

    it('should handle partial tokens', () => {
      const cost = calculateCostFromUsage('gpt-4o-mini', {
        inputTokens: 500,
        outputTokens: undefined,
      });
      // Input: 500/1M * $0.10 = $0.00005
      expect(cost).toBeCloseTo(0.00005, 8);
    });
  });

  describe('formatMonthKeyForLedger', () => {
    it('should format current month correctly', () => {
      const key = formatMonthKeyForLedger();
      expect(key).toMatch(/^\d{4}-\d{2}$/);
    });

    it('should pad single-digit months', () => {
      // January (month 0)
      const date = new Date('2025-01-15T00:00:00Z');
      const key = formatMonthKeyForLedger(date);
      expect(key).toBe('2025-01');
    });

    it('should not pad double-digit months', () => {
      // October (month 9)
      const date = new Date('2025-10-15T00:00:00Z');
      const key = formatMonthKeyForLedger(date);
      expect(key).toBe('2025-10');
    });

    it('should handle December', () => {
      const date = new Date('2025-12-15T00:00:00Z');
      const key = formatMonthKeyForLedger(date);
      expect(key).toBe('2025-12');
    });
  });

  describe('HARD_CAPS', () => {
    it('should have reasonable defaults', () => {
      expect(HARD_CAPS.maxOutputTokens).toBe(2000);
      expect(HARD_CAPS.maxRuntimeMs).toBe(60000);
      expect(HARD_CAPS.maxRetries).toBe(3);
      expect(HARD_CAPS.maxVariants).toBe(5);
    });

    it('should be positive values', () => {
      expect(HARD_CAPS.maxOutputTokens).toBeGreaterThan(0);
      expect(HARD_CAPS.maxRuntimeMs).toBeGreaterThan(0);
      expect(HARD_CAPS.maxRetries).toBeGreaterThanOrEqual(0);
      expect(HARD_CAPS.maxVariants).toBeGreaterThan(0);
    });
  });

  describe('getHardCapsForPlan', () => {
    it('should return caps for basic plan', () => {
      const caps = getHardCapsForPlan('basic');
      expect(caps.maxRuntimeMs).toBe(30000); // 30 seconds
      expect(caps.maxOutputTokens).toBe(HARD_CAPS.maxOutputTokens);
    });

    it('should return caps for standard plan', () => {
      const caps = getHardCapsForPlan('standard');
      expect(caps.maxRuntimeMs).toBe(45000); // 45 seconds
      expect(caps.maxOutputTokens).toBe(HARD_CAPS.maxOutputTokens);
    });

    it('should return caps for pro plan', () => {
      const caps = getHardCapsForPlan('pro');
      expect(caps.maxRuntimeMs).toBe(60000); // 60 seconds
      expect(caps.maxOutputTokens).toBe(HARD_CAPS.maxOutputTokens);
    });

    it('should preserve other caps from HARD_CAPS', () => {
      const basicCaps = getHardCapsForPlan('basic');
      expect(basicCaps.maxRetries).toBe(HARD_CAPS.maxRetries);
      expect(basicCaps.maxVariants).toBe(HARD_CAPS.maxVariants);
    });
  });
});
