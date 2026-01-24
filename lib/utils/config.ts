/**
 * Secure configuration loader with Zod validation
 *
 * Loads environment variables and validates them at runtime.
 * Throws descriptive errors for missing or invalid configuration.
 */

import { z } from 'zod';

/**
 * Environment variable schema for validation
 */
const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().url(),

  // Redis (Upstash)
  UPSTASH_REDIS_REST_URL: z.string().url().optional().default(''),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional().default(''),

  // QStash (for job queue)
  QSTASH_URL: z.string().url().optional().default(''),
  QSTASH_TOKEN: z.string().optional().default(''),
  QSTASH_CURRENT_SIGNING_KEY: z.string().optional().default(''),
  QSTASH_NEXT_SIGNING_KEY: z.string().optional().default(''),

  // Auth
  AUTH_SECRET: z.string().min(32).optional().default(''),

  // AI Providers
  OPENAI_API_KEY: z.string().optional().default(''),
  ANTHROPIC_API_KEY: z.string().optional().default(''),

  // App
  APP_URL: z.string().url().optional().default('http://localhost:3000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Parse and validate environment variables
 *
 * @returns Validated environment configuration
 * @throws Error if required variables are missing or invalid
 */
export function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.errors
      .map((e) => `  - ${e.path.join('.')}: ${e.message}`)
      .join('\n');

    throw new Error(`Configuration validation failed:\n${errors}`);
  }

  return result.data;
}

/**
 * Singleton config instance (lazily loaded)
 */
let configInstance: Env | null = null;

/**
 * Get configuration (singleton pattern)
 *
 * @returns Validated environment configuration
 */
export function getConfig(): Env {
  if (!configInstance) {
    configInstance = loadEnv();
  }
  return configInstance;
}

/**
 * Config object for use in the application
 * Use this instead of directly accessing process.env
 */
export const config = getConfig();
