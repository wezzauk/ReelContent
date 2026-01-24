/**
 * Test setup file for Vitest
 */

// Set up global test environment
if (!process.env.NODE_ENV) {
  Object.defineProperty(process, 'NODE_ENV', {
    value: 'test',
    writable: true,
    configurable: true,
  });
}

// Set test environment variables
process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/test';
process.env.UPSTASH_REDIS_REST_URL = 'https://test.upstash.io';
process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
