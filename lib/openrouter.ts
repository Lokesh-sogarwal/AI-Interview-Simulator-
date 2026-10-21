/**
 * OpenRouter (https://openrouter.ai): OpenAI-compatible gateway with free
 * ":free" models. Free models are rate-limited by OpenRouter (roughly 20
 * requests/minute and a daily cap that depends on the account's credit
 * balance). OPENROUTER_MODEL may list several comma-separated models; the
 * extra ones are used by OpenRouter as automatic fallbacks.
 */
export const DEFAULT_OPENROUTER_MODELS = ["minimax/minimax-m3.1-flash:free", "nvidia/nemotron-3.5-super-vl:free", "google/gemma-4-31b-it:free"];

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const TIMEOUT_MS = 60_000;

export type OpenRouterFailure = "quota" | "auth" | "rate_limit" | "model" | "timeout" | "unknown";
let lastFailure: OpenRouterFailure | null = null;

export function lastOpenRouterFailure() {
  return lastFailure;
}

export function hasOpenRouterKey() {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

export function openRouterModels(override?: string) {
  const list = (override || process.env.OPENROUTER_MODEL || "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return (list.length ? list : DEFAULT_OPENROUTER_MODELS).slice(0, 3);
}

function classify(status: number, message: string): OpenRouterFailure {
  if (status === 402 || /credit/i.test(message)) return "quota";
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate_limit";
  if (status === 404 || status === 400) return "model";
  return "unknown";
}

type ChatResponse = {
  choices?: Array<{ message?: { content?: string | null } }>;
  error?: { message?: string; code?: number };
  model?: string;
};

export async function openRouterText(params: { system: string; user: string; maxTokens?: number; temperature?: number; model?: string }): Promise<string | null> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return null;
  const [model, ...fallbacks] = openRouterModels(params.model);
  try {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        // Optional attribution headers recommended by OpenRouter.
        ...(process.env.NEXT_PUBLIC_APP_URL ? { "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL } : {}),
        "X-Title": "AI Interview Simulator",
      },
      body: JSON.stringify({
        model,
        ...(fallbacks.length ? { models: [model, ...fallbacks] } : {}),
        messages: [
          { role: "system", content: params.system },
          { role: "user", content: params.user },
        ],
        // Reasoning tokens count toward the limit even when excluded, so leave headroom.
        max_tokens: Math.max(params.maxTokens ?? 800, 1500),
        temperature: params.temperature ?? 0.4,
        // Free models are often reasoning models: keep the reasoning out of the reply.
        reasoning: { effort: "low", exclude: true },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const data = (await res.json().catch(() => null)) as ChatResponse | null;
    if (!res.ok || data?.error) {
      const status = res.ok ? Number(data?.error?.code) || 0 : res.status;
      lastFailure = classify(status, data?.error?.message ?? "");
      console.error("[openrouter] request failed", { status, model, message: String(data?.error?.message ?? "").slice(0, 200) });
      return null;
    }
    const text = data?.choices?.[0]?.message?.content?.trim();
    if (!text) {
      lastFailure = "unknown";
      return null;
    }
    lastFailure = null;
    return text;
  } catch (e) {
    lastFailure = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError") ? "timeout" : "unknown";
    console.error("[openrouter] request error:", e instanceof Error ? e.name : "unknown");
    return null;
  }
}
