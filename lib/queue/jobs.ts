/**
 * Queue job types and payload schemas for QStash job delivery
 *
 * Defines the structure of generation jobs that are enqueued
 * and processed by the worker service.
 */

import { getRequestId } from '../observability/request-id';

/**
 * Job types supported by the queue
 */
export const JOB_TYPE = {
  GENERATION: 'generation',
} as const;

export type JobType = (typeof JOB_TYPE)[keyof typeof JOB_TYPE];

/**
 * Generation job lane types - determines priority and processing
 */
export const JOB_LANE = {
  INTERACTIVE: 'interactive',  // High priority, low latency
  BATCH: 'batch',              // Lower priority, throughput optimized
} as const;

export type JobLane = (typeof JOB_LANE)[keyof typeof JOB_LANE];

/**
 * Generation job status for tracking
 */
export const JOB_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

export type JobStatus = (typeof JOB_STATUS)[keyof typeof JOB_STATUS];

/**
 * Regeneration type enum
 */
export const REGEN_TYPE = {
  TARGETED: 'targeted',  // Partial regeneration with changes
  FULL: 'full',          // Complete regeneration
} as const;

export type RegenType = (typeof REGEN_TYPE)[keyof typeof REGEN_TYPE];

/**
 * Generation job payload
 *
 * This is the complete payload sent to QStash and received by the worker.
 * All fields are required unless marked optional.
 */
export interface GenerationJob {
  /** Job type identifier */
  type: JobType;
  /** Unique job ID for tracking */
  jobId: string;
  /** User who initiated the generation */
  userId: string;
  /** Draft ID associated with this generation */
  draftId: string;
  /** Generation record ID */
  generationId: string;
  /** Processing lane (interactive or batch) */
  lane: JobLane;
  /** Number of variants to generate */
  variantCount: number;
  /** The prompt for generation */
  prompt: string;
  /** Target platform */
  platform: string;
  /** Whether this is a regeneration */
  isRegen: boolean;
  /** Parent generation ID for regenerations */
  parentGenerationId?: string;
  /** Type of regeneration */
  regenType?: RegenType;
  /** Changes description for targeted regeneration */
  regenChanges?: string;
  /** When the job was created */
  createdAt: string;
  /** Request ID for tracing */
  requestId: string;
  /** Retry count for this job (for max retries enforcement) */
  retryCount: number;
  /** Lease IDs to release on completion */
  userLeaseId?: string;
  providerLeaseId?: string;
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
  regenType?: RegenType;
  regenChanges?: string;
  userLeaseId?: string;
  providerLeaseId?: string;
  retryCount?: number;
}): GenerationJob {
  const requestId = getRequestId();
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
    requestId,
    retryCount: params.retryCount ?? 0,
    userLeaseId: params.userLeaseId,
    providerLeaseId: params.providerLeaseId,
  };
}

/**
 * Validate a job payload
 */
export function validateGenerationJob(payload: unknown): GenerationJob | null {
  if (
    typeof payload === 'object' &&
    payload !== null &&
    'type' in payload &&
    'jobId' in payload &&
    'userId' in payload &&
    'generationId' in payload
  ) {
    const job = payload as GenerationJob;
    if (job.type === JOB_TYPE.GENERATION) {
      return job;
    }
  }
  return null;
}
