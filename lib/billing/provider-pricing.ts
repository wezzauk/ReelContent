/**
 * Provider pricing model - source of truth for AI provider costs
 *
 * Defines per-model pricing for token-based cost calculations.
 * Prices are in USD per 1,000 tokens (standard industry format).
 *
 * Data sourced from provider pricing pages (as of 2025-01):
 * - OpenAI: https://openai.com/api-pricing
 * - Anthropic: https://anthropic.com/pricing
 */

import type { ProviderName } from '../ai/llm-client';

/**
 * Model pricing in USD per 1,000 tokens
 */
export interface ModelPricing {
  /** Provider name */
  provider: ProviderName;
  /** Model identifier */
  model: string;
  /** Input token price per 1M tokens (USD) */
  inputPer1M: number;
  /** Output token price per 1M tokens (USD) */
  outputPer1M: number;
  /** Effective date of this pricing */
  effectiveFrom: string;
}

/**
 * All provider models and their pricing
 * Add new models here as providers are added
 */
export const MODEL_PRICING: ModelPricing[] = [
  // OpenAI Models
  {
    provider: 'openai',
    model: 'gpt-4o-mini',
    inputPer1M: 0.10, // $0.10 per 1M input tokens
    outputPer1M: 0.40, // $0.40 per 1M output tokens
    effectiveFrom: '2025-01-01',
  },
  {
    provider: 'openai',
    model: 'gpt-4.1-mini',
    inputPer1M: 0.10, // $0.10 per 1M input tokens
    outputPer1M: 0.40, // $0.40 per 1M output tokens
    effectiveFrom: '2025-01-01',
  },
  {
    provider: 'openai',
    model: 'gpt-4o',
    inputPer1M: 2.50, // $2.50 per 1M input tokens
    outputPer1M: 10.00, // $10.00 per 1M output tokens
    effectiveFrom: '2025-01-01',
  },
  // Anthropic Models (fallback provider)
  {
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    inputPer1M: 3.00, // $3.00 per 1M input tokens
    outputPer1M: 15.00, // $15.00 per 1M output tokens
    effectiveFrom: '2025-01-01',
  },
  {
    provider: 'anthropic',
    model: 'claude-haiku-3-20250514',
    inputPer1M: 0.25, // $0.25 per 1M input tokens
    outputPer1M: 1.25, // $1.25 per 1M output tokens
    effectiveFrom: '2025-01-01',
  },
];

/**
 * Pricing lookup cache by model ID
 */
const pricingByModel = new Map<string, ModelPricing>();
MODEL_PRICING.forEach((p) => pricingByModel.set(p.model, p));

/**
 * Get pricing for a specific model
 *
 * @param model - The model identifier
 * @returns Pricing info or undefined if model not found
 */
export function getModelPricing(model: string): ModelPricing | undefined {
  return pricingByModel.get(model);
}

/**
 * Calculate cost estimate for token usage
 *
 * @param model - Model identifier
 * @param promptTokens - Number of input tokens
 * @param completionTokens - Number of output tokens
 * @returns Cost in USD (with 6 decimal precision for storage)
 */
export function calculateCost(
  model: string,
  promptTokens: number,
  completionTokens: number
): number {
  const pricing = getModelPricing(model);
  if (!pricing) {
    // Fallback: use conservative estimate for unknown models
    // This prevents silent failures but may overcharge
    return ((promptTokens + completionTokens) / 1_000_000) * 0.50; // $0.50 per 1M tokens
  }

  const inputCost = (promptTokens / 1_000_000) * pricing.inputPer1M;
  const outputCost = (completionTokens / 1_000_000) * pricing.outputPer1M;

  return inputCost + outputCost;
}

/**
 * Calculate cost from usage object
 *
 * @param model - Model identifier
 * @param usage - Token usage from provider response
 * @returns Cost in USD
 */
export function calculateCostFromUsage(
  model: string,
  usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number }
): number {
  return calculateCost(
    model,
    usage.inputTokens ?? 0,
    usage.outputTokens ?? 0
  );
}

/**
 * Hard cap configuration for job safety
 */
export interface HardCaps {
  /** Maximum output tokens per generation request */
  maxOutputTokens: number;
  /** Maximum runtime in milliseconds per generation attempt */
  maxRuntimeMs: number;
  /** Maximum retry attempts per job (QStash retries excluded) */
  maxRetries: number;
  /** Maximum total variants per generation */
  maxVariants: number;
}

/**
 * Default hard caps for all plans
 * These are safety limits that apply regardless of plan tier
 */
export const HARD_CAPS: HardCaps = {
  maxOutputTokens: 2000, // Per variant, total varies by request
  maxRuntimeMs: 60000, // 60 seconds max per generation attempt
  maxRetries: 3, // Job-level retries beyond QStash retries
  maxVariants: 5, // Absolute maximum (matches Pro plan)
};

/**
 * Get hard caps based on plan tier
 * Higher tiers get more generous runtime limits
 */
export function getHardCapsForPlan(plan: 'basic' | 'standard' | 'pro'): HardCaps {
  const baseCaps: HardCaps = { ...HARD_CAPS };

  // Adjust runtime by plan tier
  switch (plan) {
    case 'basic':
      baseCaps.maxRuntimeMs = 30000; // 30 seconds
      break;
    case 'standard':
      baseCaps.maxRuntimeMs = 45000; // 45 seconds
      break;
    case 'pro':
      baseCaps.maxRuntimeMs = 60000; // 60 seconds (full)
      break;
  }

  return baseCaps;
}

/**
 * Format month key for usage ledger (YYYY-MM format)
 * This must match the database schema format
 *
 * @param date - Date to format (defaults to current UTC date)
 * @returns Month key string in YYYY-MM format
 */
export function formatMonthKeyForLedger(date: Date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}
