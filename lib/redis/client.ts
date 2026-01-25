/**
 * Redis client and connection utilities
 *
 * Uses @upstash/redis for serverless-compatible Redis operations
 * with built-in support for Lua scripting.
 */

import { Redis } from '@upstash/redis';
import { config } from '../utils/config';

/**
 * Create a singleton Redis client instance
 *
 * The client is configured with connection pooling settings
 * optimized for serverless environments (Vercel, Cloud Run).
 */
export const redis = new Redis({
  url: config.UPSTASH_REDIS_REST_URL,
  token: config.UPSTASH_REDIS_REST_TOKEN,
  retry: {
    retries: 3,
    backoff: (attempt: number) => Math.min(50 * Math.pow(2, attempt), 1000),
  },
});

/**
 * Redis client for use in test environments (mockable)
 */
export type RedisClient = Redis;

/**
 * Result type for enforcement operations
 */
export interface EnforcementResult {
  success: boolean;
  remaining?: number;
  message?: string;
  retryAfter?: number;
}

/**
 * Result type for semaphore operations
 */
export interface SemaphoreResult {
  acquired: boolean;
  leaseId?: string;
  message?: string;
  retryAfter?: number;
}

/**
 * Result type for idempotency operations
 */
export interface IdempotencyResult<T = unknown> {
  isFirst: boolean;
  value?: T;
}

/**
 * Check if Redis connection is healthy
 *
 * @returns True if connection is healthy
 */
export async function isRedisHealthy(): Promise<boolean> {
  try {
    const pong = await redis.ping();
    return pong === 'PONG';
  } catch {
    return false;
  }
}

/**
 * Close the Redis connection (for cleanup in tests)
 */
export async function closeRedis(): Promise<void> {
  // Upstash Redis doesn't require explicit close
  // This is a no-op for compatibility
}
