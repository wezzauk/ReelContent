/**
 * Anthropic provider implementation for Reel Content
 *
 * - Requests strict JSON in plain text output
 * - Validates output with Zod
 * - Retries + timeouts + repair attempt
 *
 * NOTE: Do not log prompts or secrets.
 */

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import {
  GenerateContentRequest,
  GenerationOutputSchema,
  GenerationResult,
  Platform,
  ActionType,
} from "../llm-client";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

function requireEnvOptional(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}

// Anthropic is optional (fallback). Only error if used without a key.
const anthropicKey = requireEnvOptional("ANTHROPIC_API_KEY");

// -----------------------------
// Public provider entrypoint
// -----------------------------

export async function generateWithAnthropic(
  req: GenerateContentRequest,
  model: string
): Promise<GenerationResult> {
  if (!anthropicKey) {
    throw new Error("ANTHROPIC_API_KEY is missing, but Anthropic provider was selected.");
  }

  const maxTokens = chooseMaxOutputTokens(req.platform, req.variants, req.actionType);
  const prompt = buildPrompt(req);

  const first = await callWithRetry(() => createMessage({ model, prompt, maxTokens }));
  const parsed1 = parseJsonFromText(first);
  const validated1 = safeValidate(parsed1);

  if (validated1.ok) {
    return {
      variants: validated1.data.variants,
      provider: "anthropic",
      model,
      usage: extractUsage(first),
    };
  }

  const repairPrompt = buildRepairPrompt(req, parsed1, validated1.errorMessage);
  const second = await callWithRetry(() => createMessage({ model, prompt: repairPrompt, maxTokens }));
  const parsed2 = parseJsonFromText(second);
  const validated2 = safeValidate(parsed2);

  if (!validated2.ok) {
    throw new Error(`Anthropic output validation failed: ${validated2.errorMessage}`);
  }

  return {
    variants: validated2.data.variants,
    provider: "anthropic",
    model,
    usage: extractUsage(second),
  };
}

// -----------------------------
// Anthropic call
// -----------------------------

async function createMessage(args: { model: string; prompt: string; maxTokens: number }): Promise<any> {
  // Keep timeouts bounded.
  const timeoutMs = 25_000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await anthropic.messages.create(
      {
        model: args.model,
        max_tokens: args.maxTokens,
        temperature: 0.7,
        messages: [
          {
            role: "user",
            content: args.prompt,
          },
        ],
      },
      { signal: controller.signal }
    );

    return resp;
  } finally {
    clearTimeout(timeout);
  }
}

// -----------------------------
// Prompt building
// -----------------------------

function buildPrompt(req: GenerateContentRequest): string {
  const lines = [
    "You are Reel Content, an expert short-form social content creator.",
    "Return ONLY valid JSON. No markdown. No commentary.",
    "",
    `Platform: ${req.platform}`,
    `Action: ${req.actionType}`,
    `Niche: ${req.calibration.niche}`,
    req.calibration.audience ? `Audience: ${req.calibration.audience}` : "",
    req.calibration.tone ? `Tone: ${req.calibration.tone}` : "",
    req.calibration.goals?.length ? `Goals: ${req.calibration.goals.join(", ")}` : "",
    `Topic: ${req.input.topic}`,
    req.input.notes ? `Notes: ${req.input.notes}` : "",
    "",
    "Output JSON schema:",
    `{"variants":[{"text":"...","hashtags":["..."],"metadata":{"hook":"...","benefit":"...","cta":"..."}}]}`,
    "",
    "Rules:",
    `- Return exactly ${req.variants} variants.`,
    "- Each variant must follow this structure in its *meaning*: Hook, Benefit/What-if, Body, CTA.",
    "- text should read naturally as a single caption (not numbered).",
    "- hashtags must be an array, not embedded in text.",
    "- Instagram hashtags: 5-10; TikTok: 3-5; Facebook: 0-3.",
    "- Avoid repetition across variants.",
    req.recentHooks?.length ? `- Avoid hooks similar to: ${req.recentHooks.join(" | ")}` : "",
    req.recentCTAs?.length ? `- Avoid CTAs similar to: ${req.recentCTAs.join(" | ")}` : "",
    req.recentHashtags?.length ? `- Avoid reusing these hashtags too much: ${req.recentHashtags.join(" | ")}` : "",
    "",
    "Now generate the JSON.",
  ];

  return lines.filter(Boolean).join("\n");
}

function buildRepairPrompt(req: GenerateContentRequest, previous: unknown, errorMessage: string): string {
  return [
    "Fix the following output so it is valid JSON matching the schema exactly.",
    "Return ONLY JSON. No markdown. No commentary.",
    "",
    `Platform: ${req.platform}`,
    `Expected variants: ${req.variants}`,
    `Validation error: ${errorMessage}`,
    "",
    `Broken output: ${safeStringify(previous)}`,
    "",
    "Return corrected JSON now:",
    `{"variants":[{"text":"...","hashtags":["..."],"metadata":{"hook":"...","benefit":"...","cta":"..."}}]}`,
  ].join("\n");
}

// -----------------------------
// Parsing + validation
// -----------------------------

function parseJsonFromText(resp: any): unknown {
  // Anthropic responses are usually in resp.content[] chunks.
  const text = extractText(resp);
  if (!text) return resp;

  // Try strict parse first.
  const trimmed = text.trim();

  // Some models may wrap JSON in triple backticks; strip defensively.
  const stripped = stripCodeFences(trimmed);

  try {
    return JSON.parse(stripped);
  } catch {
    return stripped;
  }
}

function extractText(resp: any): string | null {
  const content = resp?.content;
  if (!Array.isArray(content)) return null;

  let out = "";
  for (const c of content) {
    if (c?.type === "text" && typeof c?.text === "string") out += c.text;
  }

  return out.length ? out : null;
}

function stripCodeFences(s: string): string {
  const fence = "```";
  if (!s.includes(fence)) return s;

  // Remove first and last fence blocks (simple approach).
  const withoutStart = s.replace(/^```(\w+)?\s*/i, "");
  return withoutStart.replace(/\s*```$/i, "");
}

function safeValidate(
  data: unknown
): { ok: true; data: z.infer<typeof GenerationOutputSchema> } | { ok: false; errorMessage: string } {
  const result = GenerationOutputSchema.safeParse(data);
  if (result.success) return { ok: true, data: result.data };
  return { ok: false, errorMessage: result.error.issues.map((i) => i.message).join("; ") };
}

function extractUsage(resp: any): GenerationResult["usage"] | undefined {
  // Anthropic uses `usage` with input/output tokens.
  const usage = resp?.usage;
  if (!usage) return undefined;

  const inputTokens = usage?.input_tokens;
  const outputTokens = usage?.output_tokens;

  const totalTokens =
    typeof inputTokens === "number" && typeof outputTokens === "number"
      ? inputTokens + outputTokens
      : undefined;

  return {
    inputTokens: typeof inputTokens === "number" ? inputTokens : undefined,
    outputTokens: typeof outputTokens === "number" ? outputTokens : undefined,
    totalTokens,
  };
}

// -----------------------------
// Guardrails
// -----------------------------

function chooseMaxOutputTokens(platform: Platform, variants: number, actionType: ActionType): number {
  const basePerVariant = actionType === "regen_targeted" ? 220 : 320;
  const platformAdjust = platform === "facebook" ? 0.85 : platform === "tiktok" ? 0.95 : 1.0;
  const max = Math.ceil(basePerVariant * variants * platformAdjust);
  return clamp(max, 300, 2000);
}

function clamp(n: number, min: number, max: number): number {
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

// -----------------------------
// Retry helper
// -----------------------------

async function callWithRetry<T>(fn: () => Promise<T>): Promise<T> {
  const maxAttempts = 3;
  let attempt = 0;
  let lastErr: unknown;

  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;

      if (!isRetryable(err) || attempt === maxAttempts) break;

      const delay = backoffWithJitter(attempt);
      await sleep(delay);
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error("Anthropic call failed");
}

function isRetryable(err: any): boolean {
  if (err?.name === "AbortError") return true;

  const status = err?.status ?? err?.response?.status;
  if (status === 429) return true;
  if (typeof status === "number" && status >= 500) return true;

  const msg = String(err?.message ?? "");
  if (msg.includes("ECONNRESET") || msg.includes("ETIMEDOUT") || msg.includes("ENOTFOUND")) return true;

  return false;
}

function backoffWithJitter(attempt: number): number {
  const base = 500;
  const max = 8000;
  const exp = Math.min(max, base * 2 ** (attempt - 1));
  const jitter = Math.floor(Math.random() * 250);
  return exp + jitter;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
