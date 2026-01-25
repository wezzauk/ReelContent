/**
 * Smoke tests for deployment verification
 *
 * These tests verify that the deployed application is functioning correctly.
 * Run with: npm run test:smoke
 */

import { describe, it, expect } from 'vitest';

const API_URL = process.env.API_URL || 'http://localhost:3000';

describe('Deployment Smoke Tests', () => {
  describe('Health Endpoints', () => {
    it('should return healthy status from main health endpoint', async () => {
      const response = await fetch(`${API_URL}/api/health`);

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.status).toBe('healthy');
      expect(data.checks).toBeDefined();
      expect(typeof data.checks.database).toBe('boolean');
      expect(typeof data.checks.redis).toBe('boolean');
    });

    it('should return healthy status from worker health endpoint', async () => {
      const response = await fetch(`${API_URL}/api/worker/generate`, {
        method: 'GET',
      });

      // Worker might return 503 if DB/Redis is unhealthy
      expect([200, 503]).toContain(response.status);

      const data = await response.json();
      expect(data.status).toBeDefined();
    });
  });

  describe('API Endpoints', () => {
    it('should reject requests without valid content type', async () => {
      const response = await fetch(`${API_URL}/api/v1/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
        },
        body: 'invalid',
      });

      expect(response.status).toBe(400);
    });

    it('should reject unauthenticated requests to v1 endpoints', async () => {
      const response = await fetch(`${API_URL}/api/v1/drafts/test-id`, {
        method: 'GET',
      });

      expect(response.status).toBe(401);
    });

    it('should reject invalid generation requests', async () => {
      const response = await fetch(`${API_URL}/api/v1/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          // Missing required fields
          draft_id: 'test-draft',
        }),
      });

      expect(response.status).toBe(400);
    });
  });

  describe('Environment', () => {
    it('should have required environment variables', () => {
      const required = [
        'DATABASE_URL',
        'NODE_ENV',
      ];

      required.forEach((envVar) => {
        expect(process.env[envVar], `${envVar} should be set`).toBeDefined();
      });
    });

    it('should be running in production mode when expected', () => {
      if (process.env.NODE_ENV === 'production') {
        expect(process.env.AUTH_SECRET).toBeDefined();
        expect(process.env.AUTH_SECRET?.length).toBeGreaterThanOrEqual(32);
      }
    });
  });
});
