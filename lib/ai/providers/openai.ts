/**
 * OpenAI provider implementation for Reel Content
 *
 * - Uses Structured Outputs JSON schema (response_format)
 * - Validates output with Zod (defense in depth)
 * - Implements timeouts + retries with jitter
 *
 * NOTE: Keep secrets out of logs. Never log prompts or API keys.
 */

import OpenAI from "openai";
import { z } from "zod";
import {
  GenerateContentRequest,
  GenerationOutputSchema,
  GenerationResult,
  Platform,
  ActionType,
} from "../llm-client";
import { trackProvider429, trackProviderSuccess } from "../../observability/index";

// -----------------------------
// Client
// -----------------------------

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable: ${name}`);
  return v;
}

// Ensure key exists early (fail fast)
requireEnv("OPENAI_API_KEY");

// -----------------------------
// Structured output schema (JSON Schema)
// -----------------------------
// This mirrors GenerationOutputSchema (Zod) but as JSON Schema for OpenAI response_format.
// Keep it simple to avoid schema compatibility issues.

const OpenAIJsonSchema = {
  name: "reel_content_generation",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["variants"],
    properties: {
      variants: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["hook", "benefit", "body", "cta", "hashtags"],
          properties: {
            hook: { type: "string" },
            benefit: { type: "string" },
            body: { type: "string" },
            cta: { type: "string" },
            hashtags: {
              type: "array",
              items: { type: "string" },
            },
          },
        },
      },
    },
  },
} as const;

// -----------------------------
// Public provider entrypoint
// -----------------------------

export async function generateWithOpenAI(
  req: GenerateContentRequest,
  model: string
): Promise<GenerationResult> {
  const maxOutputTokens = chooseMaxOutputTokens(req.platform, req.variants, req.actionType);

  const messages = buildMessages(req);

  // Try primary call; on schema/parse issues, do a single repair attempt.
  const first = await callWithRetry(() => createStructuredResponse({ model, messages, maxOutputTokens }));
  const parsed1 = parseStructured(first);
  const transformed1 = transformOpenAIResponse(parsed1);
  const validated1 = safeValidate(transformed1);

  if (validated1.ok) {
    return {
      variants: validated1.data.variants,
      provider: "openai",
      model,
      usage: extractUsage(first),
      raw: transformed1, // Include raw for llm-client
    };
  }

  // Repair attempt: ask model to fix to schema ONLY. Keep it short.
  const repairMessages = buildRepairMessages(req, parsed1, validated1.errorMessage);
  const second = await callWithRetry(() => createStructuredResponse({ model, messages: repairMessages, maxOutputTokens }));
  const parsed2 = parseStructured(second);
  const transformed2 = transformOpenAIResponse(parsed2);
  const validated2 = safeValidate(transformed2);

  if (!validated2.ok) {
    throw new Error(`OpenAI output validation failed: ${validated2.errorMessage}`);
  }

  return {
    variants: validated2.data.variants,
    provider: "openai",
    model,
    usage: extractUsage(second),
    raw: transformed2, // Include raw for llm-client
  };
}

// -----------------------------
// OpenAI call
// -----------------------------

async function createStructuredResponse(args: {
  model: string;
  messages: Array<{ role: "system" | "user"; content: string }>;
  maxOutputTokens: number;
}): Promise<any> {
  const controller = new AbortController();
  const timeoutMs = 25_000; // keep bounded
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Use Chat Completions API with JSON mode for structured outputs
    const resp = await openai.chat.completions.create(
      {
        model: args.model,
        messages: args.messages,
        max_tokens: args.maxOutputTokens,
        response_format: { type: "json_schema", json_schema: OpenAIJsonSchema } as any,
        temperature: 0.7,
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

function buildMessages(req: GenerateContentRequest): Array<{ role: "system" | "user"; content: string }> {
  const system = [
    "You are Reel Content, an expert short-form social content creator.",
    "Generate high-quality, non-repetitive content.",
    "Return ONLY valid JSON that matches the provided schema.",
    "Do not include any extra keys.",
  ].join(" ");

  const user = [
    `Platform: ${req.platform}`,
    `Action: ${req.actionType}`,
    `Niche: ${req.calibration.niche}`,
    req.calibration.audience ? `Audience: ${req.calibration.audience}` : "",
    req.calibration.tone ? `Tone: ${req.calibration.tone}` : "",
    req.calibration.goals?.length ? `Goals: ${req.calibration.goals.join(", ")}` : "",
    `Topic: ${req.input.topic}`,
    req.input.notes ? `Notes: ${req.input.notes}` : "",
    "",
    "Structure each variant as:",
    "1) Hook",
    "2) Benefit/What-if",
    "3) Body",
    "4) CTA",
    "",
    "Hashtags:",
    "- Provide platform-appropriate suggested hashtags as an array (not embedded in text).",
    "- Instagram: 5-10; TikTok: 3-5; Facebook: 0-3.",
    "",
    "Anti-repetition:",
    req.recentHooks?.length ? `Avoid hooks similar to: ${req.recentHooks.join(" | ")}` : "",
    req.recentCTAs?.length ? `Avoid CTAs similar to: ${req.recentCTAs.join(" | ")}` : "",
    req.recentHashtags?.length ? `Avoid repeating these hashtags too much: ${req.recentHashtags.join(" | ")}` : "",
    "",
    `Return exactly ${req.variants} variants.`,
  ]
    .filter(Boolean)
    .join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

function buildRepairMessages(
  req: GenerateContentRequest,
  previous: unknown,
  errorMessage: string
): Array<{ role: "system" | "user"; content: string }> {
  const system = [
    "You are Reel Content.",
    "You must output ONLY valid JSON that matches the schema exactly.",
    "No extra keys. No commentary.",
  ].join(" ");

  const user = [
    `Fix the following output so it matches the schema exactly.`,
    `Platform: ${req.platform}`,
    `Expected variants: ${req.variants}`,
    `Validation error: ${errorMessage}`,
    `Broken output: ${safeStringify(previous)}`,
  ].join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

// -----------------------------
// Parsing + validation
// -----------------------------

function parseStructured(resp: any): unknown {
  // Chat Completions API returns structured output in resp.choices[0].message.content
  const content = resp?.choices?.[0]?.message?.content;
  
  if (content && typeof content === 'string') {
    let text = content.trim();
    
    // Strip markdown code fences if present (```json ... ``` or ``` ... ```)
    if (text.startsWith('```json')) {
      text = text.slice(7); // Remove ```json
    } else if (text.startsWith('```')) {
      text = text.slice(3); // Remove ```
    }
    if (text.endsWith('```')) {
      text = text.slice(0, -3); // Remove trailing ```
    }
    text = text.trim();

    try {
      const parsed = JSON.parse(text);
      return parsed;
    } catch (e) {
      console.error('[OpenAI] Failed to parse response as JSON:', e);
      console.error('[OpenAI] Text that failed to parse:', text.substring(0, 500));
      return text;
    }
  }

  // Fallback: maybe already parsed JSON
  return resp;
}

function extractFirstText(resp: any): string | null {
  const output = resp?.output;
  if (!Array.isArray(output)) return null;

  for (const item of output) {
    const content = item?.content;
    if (!Array.isArray(content)) continue;

    for (const c of content) {
      if (c?.type === "output_text" && typeof c?.text === "string") return c.text;
      if (c?.type === "text" && typeof c?.text === "string") return c.text;
    }
  }
  return null;
}

/**
 * Transform OpenAI response format to our expected format
 * OpenAI returns: { hook, benefit, body, cta, hashtags }
 * We need: { text, hashtags, metadata: { hook, benefit, cta } }
 */
function transformOpenAIResponse(data: any): unknown {
  if (!data || typeof data !== 'object') return data;
  
  // If it doesn't have variants, return as-is
  if (!data.variants || !Array.isArray(data.variants)) return data;

  return {
    variants: data.variants.map((v: any) => {
      // If already in correct format, return as-is
      if (v.text && v.metadata) return v;

      // Transform from OpenAI format to our format
      // Combine hook, benefit, body, and cta into the text field
      const text = [v.hook, v.benefit, v.body, v.cta]
        .filter(Boolean)
        .join('\n\n');

      return {
        text,
        hashtags: v.hashtags || [],
        metadata: {
          hook: v.hook || '',
          benefit: v.benefit || '',
          cta: v.cta || '',
        },
      };
    }),
  };
}

function safeValidate(
  data: unknown
): { ok: true; data: z.infer<typeof GenerationOutputSchema> } | { ok: false; errorMessage: string } {
  const result = GenerationOutputSchema.safeParse(data);
  if (result.success) return { ok: true, data: result.data };

  // Log the actual data that failed validation for debugging
  console.error('[OpenAI] Validation failed for data:', JSON.stringify(data, null, 2));
  console.error('[OpenAI] Validation errors:', result.error.issues);

  return { ok: false, errorMessage: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join("; ") };
}

function extractUsage(resp: any): GenerationResult["usage"] | undefined {
  // Chat Completions API returns usage in resp.usage
  const usage = resp?.usage;
  if (!usage) return undefined;

  return {
    inputTokens: usage.prompt_tokens,
    outputTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens,
  };
}

// -----------------------------
// Guardrails
// -----------------------------

function chooseMaxOutputTokens(platform: Platform, variants: number, actionType: ActionType): number {
  // Keep conservative; adjust as you learn real distributions.
  // Targeted regen tends to be shorter.
  const basePerVariant =
    actionType === "regen_targeted" ? 220 : 320;

  const platformAdjust =
    platform === "facebook" ? 0.85 : platform === "tiktok" ? 0.95 : 1.0;

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
      const result = await fn();
      trackProviderSuccess("openai");
      return result;
    } catch (err: any) {
      lastErr = err;

      // Track 429 errors for observability
      const status = err?.status ?? err?.response?.status;
      if (status === 429) {
        trackProvider429("openai");
      }

      if (!isRetryable(err) || attempt === maxAttempts) break;

      const delay = backoffWithJitter(attempt);
      await sleep(delay);
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error("OpenAI call failed");
}

function isRetryable(err: any): boolean {
  // Abort (timeout) is retryable once or twice.
  if (err?.name === "AbortError") return true;

  const status = err?.status ?? err?.response?.status;
  if (status === 429) return true;
  if (typeof status === "number" && status >= 500) return true;

  // Network-ish errors
  const msg = String(err?.message ?? "");
  if (msg.includes("ECONNRESET") || msg.includes("ETIMEDOUT") || msg.includes("ENOTFOUND")) return true;

  return false;
}

function backoffWithJitter(attempt: number): number {
  const base = 500; // ms
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
