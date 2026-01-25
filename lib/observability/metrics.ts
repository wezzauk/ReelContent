/**
 * Metrics utilities for observability
 *
 * Tracks:
 * - Limit rejections (monthly/hourly/concurrency)
 * - Provider 429 rates
 * - Job latency (enqueue → start → complete)
 * - Generation lifecycle events
 */

import { createLogger } from './logger';
import type { GenerationJob } from '../queue/jobs';

const logger = createLogger({ module: 'metrics' });

// -----------------------------
// Metric Counters (in-memory, for basic observability)
// -----------------------------

interface MetricCounter {
  value: number;
  lastUpdated: string;
}

const metrics: Record<string, MetricCounter> = {};

/**
 * Increment a metric counter
 */
export function incrementMetric(name: string, value: number = 1): void {
  const current = metrics[name] ?? { value: 0, lastUpdated: new Date().toISOString() };
  metrics[name] = {
    value: current.value + value,
    lastUpdated: new Date().toISOString(),
  };

  logger.debug({ metric: name, value: metrics[name].value }, 'Metric incremented');
}

/**
 * Get a metric counter value
 */
export function getMetric(name: string): number {
  return metrics[name]?.value ?? 0;
}

/**
 * Reset a metric counter
 */
export function resetMetric(name: string): void {
  delete metrics[name];
}

// -----------------------------
// Limit Rejection Tracking
// -----------------------------

export const LIMIT_REJECTION_TYPES = {
  MONTHLY_LIMIT: 'limit_rejection_monthly',
  HOURLY_LIMIT: 'limit_rejection_hourly',
  CONCURRENCY_LIMIT: 'limit_rejection_concurrency',
  PROVIDER_CONCURRENCY: 'limit_rejection_provider_concurrency',
  REGEN_COOLDOWN: 'limit_rejection_regen_cooldown',
  FULL_REGEN_CAP: 'limit_rejection_full_regen_cap',
} as const;

export type LimitRejectionType = (typeof LIMIT_REJECTION_TYPES)[keyof typeof LIMIT_REJECTION_TYPES];

/**
 * Track a limit rejection event
 */
export function trackLimitRejection(
  type: LimitRejectionType,
  userId: string,
  details?: Record<string, unknown>
): void {
  incrementMetric(type);
  logger.warn({
    event: 'limit_rejection',
    rejectionType: type,
    userId,
    ...details,
  }, 'Limit rejection tracked');
}

/**
 * Get total limit rejections
 */
export function getTotalLimitRejections(): number {
  return Object.values(LIMIT_REJECTION_TYPES).reduce((sum, type) => sum + getMetric(type), 0);
}

/**
 * Get limit rejection breakdown
 */
export function getLimitRejectionBreakdown(): Record<string, number> {
  const breakdown: Record<string, number> = {};
  for (const [key, value] of Object.entries(LIMIT_REJECTION_TYPES)) {
    breakdown[key] = getMetric(value);
  }
  return breakdown;
}

// -----------------------------
// Provider 429 Rate Tracking
// -----------------------------

const provider429Counts: Record<string, number> = {};
const provider429Total: Record<string, number> = {};

/**
 * Track a provider 429 error
 */
export function trackProvider429(provider: string): void {
  provider429Counts[provider] = (provider429Counts[provider] ?? 0) + 1;
  provider429Total[provider] = (provider429Total[provider] ?? 0) + 1;
  incrementMetric(`provider_429_${provider}`);
  logger.warn({ event: 'provider_429', provider }, 'Provider 429 tracked');
}

/**
 * Track a successful provider call
 */
export function trackProviderSuccess(provider: string): void {
  provider429Total[provider] = (provider429Total[provider] ?? 0) + 1;
}

/**
 * Get provider 429 rate as a percentage
 */
export function getProvider429Rate(provider: string): number {
  const total = provider429Total[provider] ?? 0;
  const errors = provider429Counts[provider] ?? 0;
  if (total === 0) return 0;
  return (errors / total) * 100;
}

/**
 * Get all provider 429 rates
 */
export function getAllProvider429Rates(): Record<string, { rate: number; total: number; errors: number }> {
  const rates: Record<string, { rate: number; total: number; errors: number }> = {};
  for (const provider of Object.keys(provider429Total)) {
    const total = provider429Total[provider];
    const errors = provider429Counts[provider] ?? 0;
    rates[provider] = {
      rate: total > 0 ? (errors / total) * 100 : 0,
      total,
      errors,
    };
  }
  return rates;
}

// -----------------------------
// Job Latency Tracking
// -----------------------------

interface LatencySnapshot {
  jobId: string;
  generationId: string;
  requestId: string;
  enqueuedAt: string;
  startedAt?: string;
  completedAt?: string;
}

const latencySnapshots: Map<string, LatencySnapshot> = new Map();

/**
 * Record job enqueue time for latency tracking
 */
export function recordJobEnqueued(job: GenerationJob): void {
  latencySnapshots.set(job.jobId, {
    jobId: job.jobId,
    generationId: job.generationId,
    requestId: job.requestId,
    enqueuedAt: job.createdAt,
  });
  logger.info(
    { jobId: job.jobId, generationId: job.generationId, requestId: job.requestId },
    'Job enqueued for latency tracking'
  );
}

/**
 * Record job start time
 */
export function recordJobStarted(jobId: string): void {
  const snapshot = latencySnapshots.get(jobId);
  if (snapshot) {
    snapshot.startedAt = new Date().toISOString();
    latencySnapshots.set(jobId, snapshot);
    logger.info(
      { jobId, generationId: snapshot.generationId },
      'Job started processing'
    );
  }
}

/**
 * Record job completion and log latency metrics
 */
export function recordJobCompleted(
  jobId: string,
  success: boolean,
  error?: string
): { enqueueToStartMs: number; startToCompleteMs: number; totalMs: number } | null {
  const snapshot = latencySnapshots.get(jobId);
  if (!snapshot) {
    logger.warn({ jobId }, 'No latency snapshot found for completed job');
    return null;
  }

  const completedAt = new Date().toISOString();
  snapshot.completedAt = completedAt;
  latencySnapshots.set(jobId, snapshot);

  const enqueuedAt = new Date(snapshot.enqueuedAt).getTime();
  const startedAt = snapshot.startedAt ? new Date(snapshot.startedAt).getTime() : enqueuedAt;
  const finishAt = new Date(completedAt).getTime();

  const enqueueToStartMs = startedAt - enqueuedAt;
  const startToCompleteMs = finishAt - startedAt;
  const totalMs = finishAt - enqueuedAt;

  logger.info(
    {
      jobId,
      generationId: snapshot.generationId,
      requestId: snapshot.requestId,
      enqueueToStartMs,
      startToCompleteMs,
      totalMs,
      success,
      error,
    },
    'Job completed with latency metrics'
  );

  // Track as metrics
  incrementMetric('job_completed_total');
  if (success) {
    incrementMetric('job_completed_success');
  } else {
    incrementMetric('job_completed_failed');
  }

  // Track latency percentiles (simplified)
  if (totalMs < 5000) {
    incrementMetric('job_latency_under_5s');
  } else if (totalMs < 30000) {
    incrementMetric('job_latency_5s_to_30s');
  } else if (totalMs < 60000) {
    incrementMetric('job_latency_30s_to_60s');
  } else {
    incrementMetric('job_latency_over_60s');
  }

  return { enqueueToStartMs, startToCompleteMs, totalMs };
}

/**
 * Get average job latency (last N jobs)
 */
export function getAverageJobLatency(recentCount: number = 100): {
  avgEnqueueToStartMs: number;
  avgStartToCompleteMs: number;
  avgTotalMs: number;
} {
  const snapshots = Array.from(latencySnapshots.values())
    .filter((s) => s.completedAt)
    .slice(-recentCount);

  if (snapshots.length === 0) {
    return { avgEnqueueToStartMs: 0, avgStartToCompleteMs: 0, avgTotalMs: 0 };
  }

  let totalEnqueueToStart = 0;
  let totalStartToComplete = 0;
  let total = 0;

  for (const s of snapshots) {
    const enqueued = new Date(s.enqueuedAt).getTime();
    const started = s.startedAt ? new Date(s.startedAt).getTime() : enqueued;
    const completed = new Date(s.completedAt!).getTime();

    totalEnqueueToStart += started - enqueued;
    totalStartToComplete += completed - started;
    total += completed - enqueued;
  }

  return {
    avgEnqueueToStartMs: totalEnqueueToStart / snapshots.length,
    avgStartToCompleteMs: totalStartToComplete / snapshots.length,
    avgTotalMs: total / snapshots.length,
  };
}

// -----------------------------
// Generation Lifecycle Events
// -----------------------------

export const LIFECYCLE_EVENTS = {
  QUEUED: 'lifecycle_queued',
  STARTED: 'lifecycle_started',
  COMPLETED: 'lifecycle_completed',
  FAILED: 'lifecycle_failed',
} as const;

export type LifecycleEvent = (typeof LIFECYCLE_EVENTS)[keyof typeof LIFECYCLE_EVENTS];

/**
 * Log a generation lifecycle event
 */
export function logLifecycleEvent(
  event: LifecycleEvent,
  jobOrGenerationId: string,
  requestId: string,
  details?: Record<string, unknown>
): void {
  const logData = {
    event,
    generationId: jobOrGenerationId,
    requestId,
    timestamp: new Date().toISOString(),
    ...details,
  };

  switch (event) {
    case LIFECYCLE_EVENTS.QUEUED:
      logger.info(logData, 'Generation queued');
      break;
    case LIFECYCLE_EVENTS.STARTED:
      logger.info(logData, 'Generation started');
      break;
    case LIFECYCLE_EVENTS.COMPLETED:
      logger.info(logData, 'Generation completed');
      break;
    case LIFECYCLE_EVENTS.FAILED:
      logger.warn(logData, 'Generation failed');
      break;
  }

  incrementMetric(event);
}

// -----------------------------
// Observability Dashboard Data
// -----------------------------

/**
 * Get all observability metrics for monitoring/dashboard
 */
export function getObservabilityMetrics(): {
  limits: {
    totalRejections: number;
    breakdown: Record<string, number>;
  };
  providers: Record<string, { rate: number; total: number; errors: number }>;
  jobs: {
    completed: number;
    success: number;
    failed: number;
    latency: {
      average: {
        avgEnqueueToStartMs: number;
        avgStartToCompleteMs: number;
        avgTotalMs: number;
      };
      distribution: {
        under5s: number;
        '5sTo30s': number;
        '30sTo60s': number;
        over60s: number;
      };
    };
  };
  lifecycle: Record<string, number>;
} {
  return {
    limits: {
      totalRejections: getTotalLimitRejections(),
      breakdown: getLimitRejectionBreakdown(),
    },
    providers: getAllProvider429Rates(),
    jobs: {
      completed: getMetric('job_completed_total'),
      success: getMetric('job_completed_success'),
      failed: getMetric('job_completed_failed'),
      latency: {
        average: getAverageJobLatency(),
        distribution: {
          under5s: getMetric('job_latency_under_5s'),
          '5sTo30s': getMetric('job_latency_5s_to_30s'),
          '30sTo60s': getMetric('job_latency_30s_to_60s'),
          over60s: getMetric('job_latency_over_60s'),
        },
      },
    },
    lifecycle: {
      queued: getMetric(LIFECYCLE_EVENTS.QUEUED),
      started: getMetric(LIFECYCLE_EVENTS.STARTED),
      completed: getMetric(LIFECYCLE_EVENTS.COMPLETED),
      failed: getMetric(LIFECYCLE_EVENTS.FAILED),
    },
  };
}
