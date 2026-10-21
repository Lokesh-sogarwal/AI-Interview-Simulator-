export type HuggingFaceTextParams = {
  system: string;
  user: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
};

import { chatCompletion, textGeneration } from "@huggingface/inference";

type TextGenerationArgs = Parameters<typeof textGeneration>[0];
type HFProvider = TextGenerationArgs["provider"];

const HF_TIMEOUT_MS = 45_000;

function logHfError(prefix: string, error: unknown) {
  // Never log the raw error object: SDK errors can carry the request (including
  // the Authorization header with the API key).
  const err = error as { name?: unknown; message?: unknown; httpResponse?: { status?: unknown } } | null;
  const message = typeof err?.message === "string" ? err.message.slice(0, 300) : "unknown error";
  const status = typeof err?.httpResponse?.status === "number" ? err.httpResponse.status : undefined;
  console.error(prefix, { name: typeof err?.name === "string" ? err.name : undefined, status, message });
}

export type LLMFailureReason = "quota" | "auth" | "rate_limit" | "model" | "timeout" | "unknown";

/** Last failure category (no secrets), so routes can explain *why* AI is unavailable. */
let lastFailure: LLMFailureReason | null = null;
export function lastHuggingFaceFailure() {
  return lastFailure;
}

function classify(error: unknown): LLMFailureReason {
  const err = error as { name?: unknown; message?: unknown; httpResponse?: { status?: unknown } } | null;
  const status = Number(err?.httpResponse?.status);
  const msg = typeof err?.message === "string" ? err.message.toLowerCase() : "";
  if (status === 402 || msg.includes("credits")) return "quota";
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate_limit";
  if (err?.name === "TimeoutError" || err?.name === "AbortError") return "timeout";
  if (msg.includes("not supported") || status === 404 || status === 400) return "model";
  return "unknown";
}

export function hasHuggingFaceKey() {
  return Boolean(process.env.HUGGINGFACE_API_KEY);
}

function defaultModel() {
  return process.env.HUGGINGFACE_MODEL || "mistralai/Mistral-7B-Instruct-v0.3";
}

function mistralInstructPrompt(system: string, user: string) {
  return [
    "<s>[INST] <<SYS>>",
    system,
    "<</SYS>>",
    "",
    user,
    "[/INST]",
  ].join("\n");
}

export async function huggingfaceText(params: HuggingFaceTextParams): Promise<string | null> {
  const key = process.env.HUGGINGFACE_API_KEY;
  if (!key) return null;

  const model = params.model || defaultModel();
  const temperature = typeof params.temperature === "number" ? params.temperature : 0.4;
  const maxTokens = typeof params.maxTokens === "number" ? params.maxTokens : 400;
  const providerFromEnv = (process.env.HUGGINGFACE_PROVIDER || undefined) as HFProvider;
  const providerForText: HFProvider = providerFromEnv;

  try {
    const chat = await chatCompletion(
      {
        accessToken: key,
        model,
        provider: providerFromEnv,
        messages: [
          { role: "system", content: params.system },
          { role: "user", content: params.user },
        ],
        max_tokens: maxTokens,
        temperature,
      },
      { signal: AbortSignal.timeout(HF_TIMEOUT_MS) },
    );

    const chatText = chat?.choices?.[0]?.message?.content;
    if (typeof chatText === "string" && chatText.trim()) {
      lastFailure = null;
      return chatText.trim();
    }
  } catch (e) {
    logHfError("[huggingface] chatCompletion exception", e);
    lastFailure = classify(e);
    // Account-level problems affect every task; a text-generation retry cannot succeed.
    if (lastFailure === "quota" || lastFailure === "auth" || lastFailure === "rate_limit") return null;
  }

  try {
    const prompt = mistralInstructPrompt(params.system, params.user);
    const out = await textGeneration(
      {
        accessToken: key,
        model,
        provider: providerForText,
        inputs: prompt,
        parameters: {
          max_new_tokens: maxTokens,
          temperature,
          return_full_text: false,
        },
      },
      { signal: AbortSignal.timeout(HF_TIMEOUT_MS) },
    );

    const generated = (out as { generated_text?: unknown } | null)?.generated_text;
    if (typeof generated === "string" && generated.trim()) {
      lastFailure = null;
      return generated.trim();
    }
    return null;
  } catch (e) {
    logHfError("[huggingface] textGeneration exception", e);
    lastFailure ??= classify(e);
    return null;
  }
}
