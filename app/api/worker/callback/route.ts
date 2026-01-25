/**
 * POST /api/worker/callback - QStash callback endpoint
 *
 * Receives callbacks from QStash when:
 * - A job completes successfully
 * - A job fails after all retries
 *
 * This allows for cleanup and notification logic.
 */

import { createLogger } from '../../../../lib/observability/logger';
import { config } from '../../../../lib/utils/config';
import { generationRepo } from '../../../../lib/db/repositories';
import { GENERATION_STATUS } from '../../../../lib/db/schema';

const logger = createLogger({ route: '/api/worker/callback' });

/**
 * QStash callback payload
 */
interface QStashCallback {
  messageId: string;
  status: 'success' | 'error';
  error?: string;
  taskId?: string;
}

/**
 * Handle POST request - process QStash callback
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.text();
    const payload = JSON.parse(body) as QStashCallback;

    logger.info(
      { messageId: payload.messageId, status: payload.status },
      'Received QStash callback'
    );

    // Handle based on callback type
    if (payload.status === 'error') {
      // Job failed after all retries - could trigger notification
      logger.warn(
        { messageId: payload.messageId, error: payload.error },
        'Job failed after retries'
      );

      // Find and update the generation if possible
      // This is best-effort - the main worker already handles this
    }

    // Always return success to acknowledge the callback
    return new Response(
      JSON.stringify({ acknowledged: true, messageId: payload.messageId }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: errorMessage }, 'Callback processing error');

    return new Response(
      JSON.stringify({ error: 'Callback processing failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * GET /api/worker/callback - Health check for callback endpoint
 */
export async function GET(): Promise<Response> {
  return new Response(
    JSON.stringify({ status: 'ok', endpoint: 'worker-callback' }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}
