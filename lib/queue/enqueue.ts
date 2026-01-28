/**
 * Queue utilities for job scheduling with QStash
 *
 * Handles enqueueing generation jobs with proper payload schemas
 * and retry configuration.
 */

import { config } from '../utils/config';
import { recordJobEnqueued } from '../observability/index';
import type { GenerationJob, JobLane } from './jobs';

/**
 * Default retry count for jobs
 */
const DEFAULT_RETRIES = 3;

/**
 * Default delay between retries in seconds (base for exponential backoff)
 */
const BASE_RETRY_DELAY = 5;

/**
 * Enqueue a generation job with QStash
 *
 * @param job - The generation job payload
 * @param options - Enqueue options
 * @returns QStash message ID
 */
export async function enqueueGenerationJob(
  job: GenerationJob,
  options?: {
    delay?: number; // Delay in seconds
    retries?: number;
    callback?: string;
  }
): Promise<string> {
  const qstashUrl = config.QSTASH_URL;
  const token = config.QSTASH_TOKEN;

  // Local development mode: process immediately without QStash
  if (config.NODE_ENV === 'development' && config.APP_URL.includes('localhost')) {
    console.log('[Queue] Local development mode: processing job immediately (bypassing QStash)');
    
    // Process the job immediately by calling the worker endpoint directly
    try {
      const workerUrl = `${config.APP_URL}/api/worker/generate`;
      const response = await fetch(workerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Local-Dev': 'true', // Flag to skip signature verification
        },
        body: JSON.stringify(job),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Local worker failed: ${response.status} - ${error}`);
      }

      // Record job enqueued for latency tracking
      recordJobEnqueued(job);

      // Return a mock message ID
      return `local-${job.jobId}`;
    } catch (error) {
      throw new Error(`Failed to process job locally: ${error}`);
    }
  }

  if (!qstashUrl || !token) {
    throw new Error('QStash configuration is missing');
  }

  // Build QStash API URL - v2 uses body field for destination
  const workerUrl = `${config.APP_URL}/api/worker/generate`;
  const callbackUrl = options?.callback ?? `${config.APP_URL}/api/worker/callback`;
  const publishUrl = `${qstashUrl}/v2/publish`;

  // Validate that APP_URL is publicly accessible (not localhost in production)
  if (config.NODE_ENV !== 'development' && config.APP_URL.includes('localhost')) {
    throw new Error(
      'APP_URL must be a publicly accessible URL (not localhost) for QStash to work. ' +
      'Please set APP_URL to your deployed application URL.'
    );
  }

  // Build request body - v2 expects url as a field
  const requestBody = {
    url: workerUrl,
    body: JSON.stringify(job),
    callback: callbackUrl,
  };

  // Build headers
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };

  // Add retry header if specified
  if (options?.retries !== undefined) {
    headers['Upstash-Retries'] = String(options.retries);
  } else {
    headers['Upstash-Retries'] = String(DEFAULT_RETRIES);
  }

  // Add delay header if specified
  if (options?.delay !== undefined) {
    headers['Upstash-Delay'] = `${options.delay}s`;
  }

  // Add signing key for verification
  if (config.QSTASH_CURRENT_SIGNING_KEY) {
    headers['Upstash-Signing-Key'] = config.QSTASH_CURRENT_SIGNING_KEY;
  }

  try {
    const response = await fetch(publishUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`QStash enqueue failed: ${response.status} - ${error}`);
    }

    const result = await response.json();

    // Record job enqueued for latency tracking
    recordJobEnqueued(job);

    return result.messageId;
  } catch (error) {
    throw new Error(`Failed to enqueue generation job: ${error}`);
  }
}

/**
 * Enqueue a job with automatic retry configuration
 */
export async function enqueueWithRetry(
  job: GenerationJob,
  maxRetries: number = DEFAULT_RETRIES
): Promise<string> {
  return enqueueGenerationJob(job, {
    retries: maxRetries,
  });
}

/**
 * Enqueue with exponential backoff for retries
 *
 * @param job - The generation job payload
 * @param attempt - Current attempt number (internal use)
 * @returns QStash message ID
 */
export async function enqueueWithBackoff(
  job: GenerationJob,
  attempt: number = 0
): Promise<string> {
  // Calculate delay with exponential backoff and jitter
  const baseDelay = BASE_RETRY_DELAY * Math.pow(2, attempt);
  const jitter = Math.random() * baseDelay;
  const delay = Math.floor(baseDelay + jitter);

  return enqueueGenerationJob(job, {
    retries: DEFAULT_RETRIES - attempt,
    delay,
  });
}

/**
 * Lane-based queue configuration
 */
export const LANE_CONFIG: Record<JobLane, { retries: number; timeout: number }> = {
  interactive: { retries: 3, timeout: 120 },  // More retries, longer timeout
  batch: { retries: 1, timeout: 300 },         // Fewer retries, very long timeout
};

/**
 * Enqueue a job optimized for a specific lane
 */
export async function enqueueForLane(
  job: GenerationJob,
  lane: JobLane = 'interactive'
): Promise<string> {
  const laneConfig = LANE_CONFIG[lane];
  return enqueueGenerationJob(job, {
    retries: laneConfig.retries,
  });
}

/**
 * Cancel a scheduled job (if not yet processed)
 *
 * Note: QStash doesn't support direct cancellation,
 * but we can implement application-level cancellation
 * by checking job status before processing.
 */
export async function cancelJob(messageId: string): Promise<boolean> {
  // QStash doesn't support cancellation
  // Return false to indicate job cannot be cancelled
  return false;
}

/**
 * Get queue statistics (placeholder for monitoring)
 */
export async function getQueueStats(): Promise<{
  pending: number;
  processing: number;
}> {
  // This would require QStash API calls
  // Placeholder for future implementation
  return { pending: 0, processing: 0 };
}
