import { ApiError, GoogleGenAI, ThinkingLevel } from "@google/genai";

/**
 * Google Gemini via the official @google/genai SDK. Used for answer
 * evaluation, final reports and re-evaluation (see `task: "evaluation"` in
 * lib/llm.ts). Server-side only.
 */
// gemini-3.8-flash was tested too, but took 80s+ per request on the free tier (vs ~2s for 3.6).
export const DEFAULT_GEMINI_MODEL = "gemini-3.6-flash";

const TIMEOUT_MS = 40_000;
/** Total attempts per call, shared by transient-error retries and the one "cut off" retry. */
const MAX_ATTEMPTS = 2;
const DEFAULT_MAX_TOKENS = 1024;

/**
 * Thinking tokens count against maxOutputTokens, so evaluation runs with the
 * lowest level: measured on gemini-3.6-flash, "minimal" produced 0 thinking
 * tokens and complete JSON within the caps. gemini-3.8-flash has no "minimal";
 * set GEMINI_THINKING_LEVEL=low for it.
 */
function thinkingLevel() {
  const v = process.env.GEMINI_THINKING_LEVEL?.trim().toUpperCase();
  return v === "LOW" ? ThinkingLevel.LOW : v === "MEDIUM" ? ThinkingLevel.MEDIUM : ThinkingLevel.MINIMAL;
}

export type GeminiFailure = "quota" | "auth" | "rate_limit" | "model" | "timeout" | "unknown";
let lastFailure: GeminiFailure | null = null;

export function lastGeminiFailure() {
  return lastFailure;
}

export function hasGeminiKey() {
  return Boolean(process.env.GEMINI_API_KEY);
}

export function geminiModel() {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
}

// One client per key, reused across requests in the same function instance.
let client: { key: string; ai: GoogleGenAI } | null = null;
function getClient(key: string) {
  if (client?.key !== key) client = { key, ai: new GoogleGenAI({ apiKey: key }) };
  return client.ai;
}

function classify(e: unknown): GeminiFailure {
  if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) return "timeout";
  const status = e instanceof ApiError ? e.status : 0;
  const message = e instanceof Error ? e.message : "";
  if (status === 429) return /PerDay|per day|daily/i.test(message) ? "quota" : "rate_limit";
  if (status === 401 || status === 403 || /API_KEY_INVALID|API key not valid/i.test(message)) return "auth";
  if (status === 404) return "model";
  if (status === 408 || status >= 500) return "timeout";
  return "unknown";
}

const retryable = (f: GeminiFailure) => f === "rate_limit" || f === "timeout";

/**
 * Generates text (or JSON constrained by `jsonSchema`) within `maxTokens`
 * output tokens. A reply cut off at the limit is never returned: it is retried
 * once with double the limit, then reported as a failure. Returns null on any
 * failure; the reason is available from `lastGeminiFailure()`.
 */
export async function geminiText(params: {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
  jsonSchema?: unknown;
}): Promise<string | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const ai = getClient(key);
  let maxOutputTokens = params.maxTokens ?? DEFAULT_MAX_TOKENS;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const res = await ai.models.generateContent({
        model: geminiModel(),
        contents: params.user,
        config: {
          systemInstruction: params.system,
          temperature: params.temperature ?? 0.3,
          maxOutputTokens,
          thinkingConfig: { thinkingLevel: thinkingLevel() },
          ...(params.jsonSchema ? { responseMimeType: "application/json", responseJsonSchema: params.jsonSchema } : {}),
          abortSignal: AbortSignal.timeout(TIMEOUT_MS),
        },
      });
      const text = res.text?.trim();
      const finish = res.candidates?.[0]?.finishReason;
      if (text && finish !== "MAX_TOKENS") {
        lastFailure = null;
        return text;
      }
      lastFailure = "unknown";
      console.error("[gemini] unusable response", { finish: finish ?? null, empty: !text, maxOutputTokens, usage: res.usageMetadata ? { out: res.usageMetadata.candidatesTokenCount, thoughts: res.usageMetadata.thoughtsTokenCount } : null });
      if (finish !== "MAX_TOKENS" || attempt === MAX_ATTEMPTS) return null;
      maxOutputTokens *= 2;
    } catch (e) {
      lastFailure = classify(e);
      console.error("[gemini] request failed", { status: e instanceof ApiError ? e.status : null, reason: lastFailure });
      if (!retryable(lastFailure) || attempt === MAX_ATTEMPTS) return null;
      await new Promise((r) => setTimeout(r, 1_500));
    }
  }
  return null;
}
