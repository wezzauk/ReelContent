/**
 * POST /api/worker/generate - Worker endpoint for processing generation jobs
 *
 * Receives jobs from QStash and processes them.
 * Verifies QStash signatures and delegates to the worker handler.
 */

import { config } from '../../../lib/utils/config';
import { createLogger } from '../../../lib/observability/logger';
import {
  validateGenerationJob,
  type GenerationJob,
} from '../../../lib/queue/jobs';
import { processGenerationJob, verifyQStashSignature, getWorkerHealth } from '../../../lib/workers/worker';

const logger = createLogger({ route: '/api/worker/generate' });

/**
 * Parse and validate the request body
 */
async function parseRequest(request: Request): Promise<GenerationJob | null> {
  const contentType = request.headers.get('content-type');

  if (contentType !== 'application/json') {
    logger.warn({ contentType }, 'Invalid content type');
    return null;
  }

  try {
    const body = await request.text();
    const payload = JSON.parse(body);
    const job = validateGenerationJob(payload);

    if (!job) {
      logger.warn({ payload }, 'Invalid job payload');
      return null;
    }

    return job;
  } catch (error) {
    logger.warn({ error }, 'Failed to parse request body');
    return null;
  }
}

/**
 * Verify QStash signature
 */
function verifySignature(request: Request, body: string): boolean {
  const signature = request.headers.get('upstash-signature') || '';
  return verifyQStashSignature(signature, body);
}

/**
 * Handle POST request - process a generation job
 */
export async function POST(request: Request): Promise<Response> {
  try {
    // Parse request body
    const body = await request.text();
    const job = await parseRequest(request);

    if (!job) {
      return new Response(
        JSON.stringify({ error: 'Invalid job payload' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Verify signature
    if (!verifySignature(request, body)) {
      logger.warn({ jobId: job.jobId }, 'Invalid QStash signature');
      return new Response(
        JSON.stringify({ error: 'Invalid signature' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Process the job
    const result = await processGenerationJob(job);

    // Return appropriate status based on result
    if (result.success) {
      return new Response(
        JSON.stringify({
          success: true,
          jobId: result.jobId,
          generationId: result.generationId,
          variants: result.variants?.length || 0,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Job failed
    const status = result.shouldRetry ? 500 : 400;
    return new Response(
      JSON.stringify({
        success: false,
        jobId: result.jobId,
        error: result.error,
        retry: result.shouldRetry,
        retryAfter: result.retryAfter,
      }),
      { status, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: errorMessage }, 'Worker error');

    return new Response(
      JSON.stringify({ error: 'Internal worker error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * GET /api/worker/generate - Health check endpoint
 */
export async function GET(): Promise<Response> {
  try {
    const health = await getWorkerHealth();

    const status = health.status === 'healthy' ? 200 : 503;
    return new Response(
      JSON.stringify(health),
      { status, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    logger.error({ error }, 'Health check failed');

    return new Response(
      JSON.stringify({
        status: 'unhealthy',
        error: 'Health check failed',
      }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
