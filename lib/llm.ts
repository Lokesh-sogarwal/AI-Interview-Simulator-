import { geminiText, hasGeminiKey, lastGeminiFailure } from "@/lib/gemini";
import { groqText, hasGroqKey, lastGroqFailure } from "@/lib/groq";
import { huggingfaceText, hasHuggingFaceKey, lastHuggingFaceFailure } from "@/lib/huggingface";
import { hasOpenAIKey, openaiText } from "@/lib/openai";
import { DEFAULT_OPENROUTER_MODELS, hasOpenRouterKey, lastOpenRouterFailure, openRouterModels, openRouterText } from "@/lib/openrouter";

export type LLMProvider = "groq" | "gemini" | "openrouter" | "huggingface" | "openai";

export type LLMModels = Partial<Record<LLMProvider, string>>;

/**
 * What the call is for. Each task has a dedicated provider that, once its key
 * is configured, handles that task exclusively (no silent fallback):
 *  - "question":   Groq (interview questions and interviewer turns)
 *  - "evaluation": Gemini (answer scoring, reports, re-evaluation)
 * Without the dedicated key, or for untagged calls, the legacy chain is used.
 */
export type LLMTask = "question" | "evaluation";

/** Provider that served (or failed) the most recent call, for error reporting. */
let lastRoute: "groq" | "gemini" | "chain" = "chain";

export async function llmText(params: {
  system: string;
  user: string;
  models?: LLMModels;
  /** Upper bound on generated tokens. Structured JSON outputs need far more than the 400-token default. */
  maxTokens?: number;
  temperature?: number;
  /** Only free models (Gemini free tier, or OpenRouter ":free"); never falls back to paid providers. */
  freeOnly?: boolean;
  task?: LLMTask;
  /** JSON Schema for structured output (Gemini enforces it; other providers just get JSON prompts). */
  jsonSchema?: unknown;
  /** The prompt asks for a JSON object; enables JSON mode where supported (Groq). */
  json?: boolean;
}): Promise<{ text: string; provider: LLMProvider } | null> {
  if (params.task === "question" && hasGroqKey()) {
    lastRoute = "groq";
    const text = await groqText({ system: params.system, user: params.user, maxTokens: params.maxTokens, temperature: params.temperature, json: params.json });
    return text ? { text, provider: "groq" } : null;
  }
  if (params.task === "evaluation" && hasGeminiKey()) {
    lastRoute = "gemini";
    const text = await geminiText({ system: params.system, user: params.user, maxTokens: params.maxTokens, temperature: params.temperature, jsonSchema: params.jsonSchema });
    return text ? { text, provider: "gemini" } : null;
  }
  lastRoute = "chain";

  if (params.freeOnly) {
    if (!hasOpenRouterKey()) return null;
    const free = openRouterModels(params.models?.openrouter).filter((m) => m.endsWith(":free"));
    const text = await openRouterText({
      system: params.system,
      user: params.user,
      model: (free.length ? free : DEFAULT_OPENROUTER_MODELS).join(","),
      maxTokens: params.maxTokens,
      temperature: params.temperature,
    });
    return text ? { text, provider: "openrouter" } : null;
  }

  // Order: OpenRouter (free models) → Hugging Face → OpenAI; each only when configured.
  if (hasOpenRouterKey()) {
    const text = await openRouterText({
      system: params.system,
      user: params.user,
      model: params.models?.openrouter,
      maxTokens: params.maxTokens,
      temperature: params.temperature,
    });
    if (text) return { text, provider: "openrouter" };
  }

  if (hasHuggingFaceKey()) {
    const text = await huggingfaceText({
      system: params.system,
      user: params.user,
      model: params.models?.huggingface,
      maxTokens: params.maxTokens,
      temperature: params.temperature,
    });
    if (text) return { text, provider: "huggingface" };
  }

  if (hasOpenAIKey()) {
    const text = await openaiText({
      system: params.system,
      user: params.user,
      model: params.models?.openai,
      maxTokens: params.maxTokens,
      temperature: params.temperature,
    });
    if (text) return { text, provider: "openai" };
  }

  return null;
}

/** True when a free model can serve `freeOnly` evaluation calls. */
export function hasFreeLLMProvider() {
  return hasGeminiKey() || hasOpenRouterKey();
}

export function hasLLMProvider() {
  return hasGroqKey() || hasGeminiKey() || hasOpenRouterKey() || hasHuggingFaceKey() || hasOpenAIKey();
}

/**
 * Standard response when no AI provider produced a usable answer. Routes must
 * return this instead of inventing questions, scores or feedback.
 */
const FAILURE_TEXT: Record<string, string> = {
  quota: "the AI provider account has run out of credits or its free daily limit (an administrator needs to top it up or wait for the reset)",
  auth: "the AI provider rejected the server's API key",
  rate_limit: "the AI provider is rate-limiting requests",
  model: "the configured AI model is not available from the provider",
  timeout: "the AI provider took too long to respond",
};

/** Human-readable reason for the last AI failure, without any secrets. */
export function aiFailureDetail() {
  // Report the preferred provider's failure (all configured providers failed when this is called).
  const reason = lastRoute === "groq" ? lastGroqFailure() : lastRoute === "gemini" ? lastGeminiFailure() : hasOpenRouterKey() ? lastOpenRouterFailure() : hasHuggingFaceKey() && !hasOpenAIKey() ? lastHuggingFaceFailure() : null;
  return reason ? { reason, text: FAILURE_TEXT[reason] ?? null } : { reason: null, text: null };
}

export function aiUnavailableResponse(what = "The AI service") {
  const detail = aiFailureDetail();
  return Response.json(
    {
      ok: false,
      code: hasLLMProvider() ? "ai_unavailable" : "ai_not_configured",
      reason: detail.reason,
      retryable: hasLLMProvider() && detail.reason !== "quota" && detail.reason !== "auth" && detail.reason !== "model",
      error: !hasLLMProvider()
        ? `${what} is not configured on this server.`
        : detail.text
          ? `${what} is unavailable: ${detail.text}.`
          : `${what} is temporarily unavailable. Please try again in a moment.`,
    },
    { status: 503 },
  );
}
