import { huggingfaceText, hasHuggingFaceKey, lastHuggingFaceFailure } from "@/lib/huggingface";
import { hasOpenAIKey, openaiText } from "@/lib/openai";
import { hasOpenRouterKey, lastOpenRouterFailure, openRouterText } from "@/lib/openrouter";

export type LLMProvider = "openrouter" | "huggingface" | "openai";

export type LLMModels = Partial<Record<LLMProvider, string>>;

export async function llmText(params: {
  system: string;
  user: string;
  models?: LLMModels;
  /** Upper bound on generated tokens. Structured JSON outputs need far more than the 400-token default. */
  maxTokens?: number;
  temperature?: number;
}): Promise<{ text: string; provider: LLMProvider } | null> {
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

export function hasLLMProvider() {
  return hasOpenRouterKey() || hasHuggingFaceKey() || hasOpenAIKey();
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
  const reason = hasOpenRouterKey() ? lastOpenRouterFailure() : hasHuggingFaceKey() && !hasOpenAIKey() ? lastHuggingFaceFailure() : null;
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
