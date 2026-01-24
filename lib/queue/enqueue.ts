/**
 * Queue utilities for job scheduling with QStash
 *
 * Handles enqueueing generation jobs with proper payload schemas
 * and retry configuration.
 */

import { config } from '../utils/config.js';
import { getRequestId } from '../observability/request-id.js';

/**
 * Job types supported by the queue
 */
export const JOB_TYPE = {
  GENERATION: 'generation',
} as const;

export type JobType = (typeof JOB_TYPE)[keyof typeof JOB_TYPE];

/**
 * Generation job lane types
 */
export const JOB_LANE = {
  INTERACTIVE: 'interactive',
  BATCH: 'batch',
} as const;

export type JobLane = (typeof JOB_LANE)[keyof typeof JOB_LANE];

/**
 * Generation job payload
 */
export interface GenerationJob {
  type: JobType;
  jobId: string;
  userId: string;
  draftId: string;
  generationId: string;
  lane: JobLane;
  variantCount: number;
  prompt: string;
  platform: string;
  isRegen: boolean;
  parentGenerationId?: string;
  regenType?: 'targeted' | 'full';
  regenChanges?: string;
  createdAt: string;
}

/**
 * Create a generation job payload
 */
export function createGenerationJob(params: {
  userId: string;
  draftId: string;
  generationId: string;
  lane?: JobLane;
  variantCount: number;
  prompt: string;
  platform: string;
  isRegen?: boolean;
  parentGenerationId?: string;
  regenType?: 'targeted' | 'full';
  regenChanges?: string;
}): GenerationJob {
  return {
    type: JOB_TYPE.GENERATION,
    jobId: getRequestId(),
    userId: params.userId,
    draftId: params.draftId,
    generationId: params.generationId,
    lane: params.lane ?? JOB_LANE.INTERACTIVE,
    variantCount: params.variantCount,
    prompt: params.prompt,
    platform: params.platform,
    isRegen: params.isRegen ?? false,
    parentGenerationId: params.parentGenerationId,
    regenType: params.regenType,
    regenChanges: params.regenChanges,
    createdAt: new Date().toISOString(),
  };
}

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

  if (!qstashUrl || !token) {
    throw new Error('QStash configuration is missing');
  }

  // Build QStash API URL
  const url = `${qstashUrl}/v2/publish/${qstashUrl}`;

  // Build request body
  const body = JSON.stringify(job);

  // Build headers
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'Upstash-Callback': options?.callback ?? `${config.APP_URL}/api/worker/callback`,
  };

  // Add retry header if specified
  if (options?.retries !== undefined) {
    headers['Upstash-Retries'] = String(options.retries);
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
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`QStash enqueue failed: ${response.status} - ${error}`);
    }

    const result = await response.json();
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
  maxRetries: number = 3
): Promise<string> {
  return enqueueGenerationJob(job, {
    retries: maxRetries,
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
