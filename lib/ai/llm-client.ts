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
  // You can extend this later, but keep it stable for v1.
}

export interface GenerateContentRequest {
  actionType: ActionType;
  plan: Plan;
  platform: Platform;
  variants: number;

  // Preset and other spec-driven inputs can be added here.
  // Keep nesting shallow: group related fields.
  input: {
    topic: string;
    notes?: string; // optional extra context
  };

  calibration: Calibration;

  // Anti-repetition / memory hints (optional v1 hooks)
  // Keep these short + bounded.
  recentHooks?: string[];
  recentCTAs?: string[];
  recentHashtags?: string[];

  // Optional request correlation IDs for observability
  requestId?: string;
  generationId?: string;
}

export interface ContentVariant {
  text: string; // caption / post content
  hashtags: string[]; // suggested hashtags (separate field)
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
  raw?: unknown; // optional: keep disabled by default in logs
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
    if (req.actionType === "create") return { provider: "openai", model: "gpt-4.1-mini" };
    if (req.actionType === "regen_targeted") return { provider: "openai", model: "gpt-4o-mini" };
    return { provider: "openai", model: "gpt-4.1-mini" }; // full regen
  }

  // Pro: best available across create/full; targeted can remain cheaper
  if (req.actionType === "regen_targeted") {
    return { provider: "openai", model: "gpt-4o-mini" };
  }
  return { provider: "openai", model: "gpt-4.1-mini" };
}

// -----------------------------
// Public entrypoint
// -----------------------------

/**
 * The single entrypoint the worker/API should call for generation.
 */
export async function generateContent(req: GenerateContentRequest): Promise<GenerationResult> {
  const route = chooseRoute(req);

  // Guardrails: variants must be a small positive integer
  // (Your plan enforcement should already enforce this, but defense-in-depth here helps.)
  const variants = clampInt(req.variants, 1, 10);

  const normalizedReq: GenerateContentRequest = { ...req, variants };

  if (route.provider === "openai") {
    return generateWithOpenAI(normalizedReq, route.model);
  }

  return generateWithAnthropic(normalizedReq, route.model);
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  const v = Math.trunc(value);
  if (v < min) return min;
  if (v > max) return max;
  return v;
}
