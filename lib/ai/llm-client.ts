/**
 * Reel Content - LLM client router
 *
 * This is the ONLY module that the rest of the app should call for content generation.
 * It routes to the correct provider/model and returns a normalized, validated result.
 */

import { z } from "zod";
import { generateWithOpenAI } from "./providers/openai";
import { generateWithAnthropic } from "./providers/anthropic";

// -----------------------------
// Errors
// -----------------------------

/**
 * Thrown when global LLM generation is disabled via env flag.
 * This should be treated as:
 * - non-retryable
 * - HTTP 503 in API layer
 * - immediate fail in workers (no retries)
 */
export class LLMDisabledError extends Error {
  constructor() {
    super("LLM generation is currently disabled");
    this.name = "LLMDisabledError";
  }
}

// -----------------------------
// Types
// -----------------------------

export type ActionType = "create" | "regen_targeted" | "regen_full";
export type Plan = "basic" | "standard" | "pro";
export type Platform = "instagram" | "tiktok" | "facebook";

export type ProviderName = "openai" | "anthropic";

export interface Calibration {
  niche: string;
  audience?: string;
  tone?: string;
  goals?: string[];
}

export interface GenerateContentRequest {
  actionType: ActionType;
  plan: Plan;
  platform: Platform;
  variants: number;

  input: {
    topic: string;
    notes?: string;
  };

  calibration: Calibration;

  // Optional anti-repetition hints
  recentHooks?: string[];
  recentCTAs?: string[];
  recentHashtags?: string[];

  // Optional observability
  requestId?: string;
  generationId?: string;
}

export interface ContentVariant {
  text: string;
  hashtags: string[];
  metadata: {
    hook: string;
    benefit: string;
    cta: string;
  };
}

export interface GenerationResult {
  variants: ContentVariant[];
  provider: ProviderName;
  model: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  raw?: unknown;
}

// -----------------------------
// Schema (shared output contract)
// -----------------------------

export const ContentVariantSchema = z.object({
  text: z.string().min(1),
  hashtags: z.array(z.string().min(1)).default([]),
  metadata: z.object({
    hook: z.string().min(1),
    benefit: z.string().min(1),
    cta: z.string().min(1),
  }),
});

export const GenerationOutputSchema = z.object({
  variants: z.array(ContentVariantSchema).min(1),
});

export type GenerationOutput = z.infer<typeof GenerationOutputSchema>;

// -----------------------------
// Routing
// -----------------------------

export interface RouteDecision {
  provider: ProviderName;
  model: string;
}

/**
 * Keep routing logic thin and deterministic.
 * No prompt building here; only choose provider + model.
 */
export function chooseRoute(req: GenerateContentRequest): RouteDecision {
  // Basic: cheapest reliable model
  if (req.plan === "basic") {
    return { provider: "openai", model: "gpt-4o-mini" };
  }

  // Standard: better quality for create, cheaper for targeted regen
  if (req.plan === "standard") {
    if (req.actionType === "create") {
      return { provider: "openai", model: "gpt-4.1-mini" };
    }
    if (req.actionType === "regen_targeted") {
      return { provider: "openai", model: "gpt-4o-mini" };
    }
    return { provider: "openai", model: "gpt-4.1-mini" }; // full regen
  }

  // Pro: best available across create/full; targeted can remain cheaper
  if (req.plan === "pro") {
    if (req.actionType === "create" || req.actionType === "regen_full") {
      return { provider: "anthropic", model: "claude-sonnet-4-20250514" };
    }
    // targeted regen can use cheaper model
    return { provider: "openai", model: "gpt-4o-mini" };
  }

  // Default fallback
  return { provider: "openai", model: "gpt-4o-mini" };
}

// -----------------------------
// Generation
// -----------------------------

/**
 * Generate content using the appropriate provider based on routing.
 * This is the main entry point for content generation.
 */
export async function generateContent(
  req: GenerateContentRequest
): Promise<GenerationResult> {
  // Check if LLM is disabled
  const llmEnabled = process.env.LLM_ENABLED !== "false";
  if (!llmEnabled) {
    throw new LLMDisabledError();
  }

  // Route to the appropriate provider
  const route = chooseRoute(req);

  // Generate based on provider
  let result: GenerationResult;
  if (route.provider === "openai") {
    result = await generateWithOpenAI(req, route.model);
  } else {
    result = await generateWithAnthropic(req, route.model);
  }

  // Parse and validate the response
  const parsed = GenerationOutputSchema.parse(result.raw);

  // Transform to our format
  const variants: ContentVariant[] = parsed.variants.map((v) => ({
    text: v.text,
    hashtags: v.hashtags,
    metadata: v.metadata,
  }));

  return {
    variants,
    provider: route.provider,
    model: route.model,
    usage: result.usage,
    raw: result.raw,
  };
}
