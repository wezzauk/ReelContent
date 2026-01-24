/**
 * Unit tests for redis/keys.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  usageKey,
  burstKey,
  fullRegenKey,
  regenCooldownKey,
  userLeasesKey,
  leaseKey,
  providerConcurrencyKey,
  idempotencyKey,
  userPlanKey,
  userBoostKey,
  generationInProgressKey,
  keys,
  TTL_CONFIG,
} from '../../lib/redis/keys.js';
import { formatMonthKey, formatHourKey } from '../../lib/billing/plans.js';

describe('redis/keys', () => {
  describe('usageKey', () => {
    it('should generate correct key pattern', () => {
      const userId = 'user123';
      const monthKey = '202501';
      const key = usageKey(userId, monthKey);

      expect(key).toBe('app:usage:user123:gen_used:202501');
    });

    it('should use current month when not provided', () => {
      const key = usageKey('user123');
      const expectedMonth = formatMonthKey();

      expect(key).toBe(`app:usage:user123:gen_used:${expectedMonth}`);
    });
  });

  describe('burstKey', () => {
    it('should generate correct key pattern', () => {
      const userId = 'user123';
      const hourKey = '2025012414';
      const key = burstKey(userId, hourKey);

      expect(key).toBe('app:burst:user123:gen_hour:2025012414');
    });

    it('should use current hour when not provided', () => {
      const key = burstKey('user123');
      const expectedHour = formatHourKey();

      expect(key).toBe(`app:burst:user123:gen_hour:${expectedHour}`);
    });
  });

  describe('fullRegenKey', () => {
    it('should generate correct key pattern', () => {
      const key = fullRegenKey('user123', '202501');

      expect(key).toBe('app:usage:user123:full_regen_used:202501');
    });
  });

  describe('regenCooldownKey', () => {
    it('should generate correct key pattern', () => {
      const key = regenCooldownKey('user123', 'draft456');

      expect(key).toBe('app:cooldown:user123:regen:draft456');
    });
  });

  describe('userLeasesKey', () => {
    it('should generate correct key pattern', () => {
      const key = userLeasesKey('user123');

      expect(key).toBe('app:conc:user123:leases');
    });
  });

  describe('leaseKey', () => {
    it('should generate correct key pattern', () => {
      const key = leaseKey('lease-abc123');

      expect(key).toBe('app:conc:lease:lease-abc123');
    });
  });

  describe('providerConcurrencyKey', () => {
    it('should generate correct key pattern', () => {
      const key = providerConcurrencyKey('minimax', 'video', 'interactive');

      expect(key).toBe('app:conc:provider:minimax:video:interactive');
    });
  });

  describe('idempotencyKey', () => {
    it('should generate correct key pattern', () => {
      const key = idempotencyKey('user123', 'create', 'idem-key-123');

      expect(key).toBe('app:idem:user123:create:idem-key-123');
    });
  });

  describe('userPlanKey', () => {
    it('should generate correct key pattern', () => {
      const key = userPlanKey('user123');

      expect(key).toBe('app:user:user123:plan_effective');
    });
  });

  describe('userBoostKey', () => {
    it('should generate correct key pattern', () => {
      const key = userBoostKey('user123');

      expect(key).toBe('app:boost:user123:pro_until');
    });
  });

  describe('generationInProgressKey', () => {
    it('should generate correct key pattern', () => {
      const key = generationInProgressKey('gen123');

      expect(key).toBe('app:gen:gen123:in_progress');
    });
  });

  describe('keys object', () => {
    it('should export all key builder functions', () => {
      expect(keys.usage).toBeTypeOf('function');
      expect(keys.burst).toBeTypeOf('function');
      expect(keys.fullRegen).toBeTypeOf('function');
      expect(keys.regenCooldown).toBeTypeOf('function');
      expect(keys.userLeases).toBeTypeOf('function');
      expect(keys.lease).toBeTypeOf('function');
      expect(keys.providerConcurrency).toBeTypeOf('function');
      expect(keys.idempotency).toBeTypeOf('function');
      expect(keys.userPlan).toBeTypeOf('function');
      expect(keys.userBoost).toBeTypeOf('function');
      expect(keys.generationInProgress).toBeTypeOf('function');
    });
  });

  describe('TTL_CONFIG', () => {
    it('should have appropriate TTL values', () => {
      expect(TTL_CONFIG.REGEN_COOLDOWN).toBe(300);
      expect(TTL_CONFIG.LEASE).toBe(1800);
      expect(TTL_CONFIG.PLAN_CACHE).toBe(600);
      expect(TTL_CONFIG.BOOST_CACHE).toBe(300);
      expect(TTL_CONFIG.IDEMPOTENCY).toBe(86400);
      expect(TTL_CONFIG.IN_PROGRESS).toBe(7200);
    });

    it('should have null for dynamic TTLs', () => {
      expect(TTL_CONFIG.USAGE).toBeNull();
      expect(TTL_CONFIG.BURST).toBeNull();
    });
  });
});
