/**
 * GET /api/health - Health check endpoint for deployment verification
 *
 * Returns the health status of the API and its dependencies.
 * Used by deployment smoke tests and load balancers.
 */

import { config } from '../../../lib/utils/config';
import { createLogger } from '../../../lib/observability/logger';

const logger = createLogger({ route: '/api/health' });

/**
 * Health check response
 */
interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  checks: {
    database: boolean;
    redis: boolean;
  };
  environment: string;
}

/**
 * GET /api/health
 */
export async function GET(): Promise<Response> {
  const startTime = Date.now();
  const checks = {
    database: false,
    redis: false,
  };

  try {
    // Check database connectivity
    try {
      const { checkConnection } = await import('../../../lib/db/client');
      checks.database = await checkConnection();
    } catch (error) {
      logger.warn({ error }, 'Database health check failed');
    }

    // Check Redis connectivity
    try {
      const { redis } = await import('../../../lib/redis/client');
      await redis.ping();
      checks.redis = true;
    } catch (error) {
      logger.warn({ error }, 'Redis health check failed');
    }

    const allHealthy = checks.database && checks.redis;
    const status = allHealthy ? 'healthy' : 'degraded';

    const response: HealthResponse = {
      status,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '0.1.0',
      checks,
      environment: config.NODE_ENV,
    };

    const statusCode = status === 'healthy' ? 200 : 503;

    logger.info(
      { status, checks, durationMs: Date.now() - startTime },
      'Health check completed'
    );

    return new Response(JSON.stringify(response), {
      status: statusCode,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    logger.error({ error: errorMessage }, 'Health check failed');

    const response = {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: errorMessage,
      checks,
      environment: config.NODE_ENV,
    };

    return new Response(JSON.stringify(response), {
      status: 503,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  }
}
