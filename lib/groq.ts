/**
 * Groq (https://console.groq.com/docs): OpenAI-compatible chat completions.
 * Used only for interview question generation (see `task: "question"` in
 * lib/llm.ts). Server-side only; the key never leaves this module.
 */
export const DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const TIMEOUT_MS = 20_000;
/** One retry for transient failures; a longer wait would not fit the request budget. */
const MAX_ATTEMPTS = 2;
const MAX_RETRY_WAIT_MS = 4_000;
/** A single question is ~50 tokens; an interviewer turn (JSON) ~150. */
const DEFAULT_MAX_TOKENS = 300;

export type GroqFailure = "quota" | "auth" | "rate_limit" | "model" | "timeout" | "unknown";
let lastFailure: GroqFailure | null = null;

export function lastGroqFailure() {
  return lastFailure;
}

export function hasGroqKey() {
  return Boolean(process.env.GROQ_API_KEY);
}

export function groqModel() {
  return process.env.GROQ_MODEL?.trim() || DEFAULT_GROQ_MODEL;
}

function classify(status: number, message: string): GroqFailure {
  // Daily caps (RPD/TPD) won't clear by retrying; per-minute limits will.
  if (status === 429) return /per day|\bRPD\b|\bTPD\b|daily/i.test(message) ? "quota" : "rate_limit";
  if (status === 401 || status === 403) return "auth";
  if (status === 404 || (status === 400 && /model/i.test(message))) return "model";
  if (status === 408 || status >= 500) return "timeout";
  return "unknown";
}

const retryable = (f: GroqFailure) => f === "rate_limit" || f === "timeout";

type ChatResponse = { choices?: Array<{ message?: { content?: string | null }; finish_reason?: string }>; error?: { message?: string } };

export async function groqText(params: { system: string; user: string; maxTokens?: number; temperature?: number; json?: boolean }): Promise<string | null> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;

  let maxTokens = params.maxTokens ?? DEFAULT_MAX_TOKENS;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let waitMs = 1_000;
    try {
      const res = await fetch(GROQ_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: groqModel(),
          messages: [
            { role: "system", content: params.system },
            { role: "user", content: params.user },
          ],
          // Groq's current name for the output limit (`max_tokens` is deprecated).
          max_completion_tokens: maxTokens,
          temperature: params.temperature ?? 0.6,
          // gpt-oss models reason before answering and that reasoning counts toward the limit; keep it short.
          ...(groqModel().startsWith("openai/gpt-oss") ? { reasoning_effort: "low" } : {}),
          // JSON mode requires the prompt to ask for JSON; only callers that do pass `json`.
          ...(params.json ? { response_format: { type: "json_object" } } : {}),
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const data = (await res.json().catch(() => null)) as ChatResponse | null;
      if (!res.ok) {
        const message = String(data?.error?.message ?? "");
        lastFailure = classify(res.status, message);
        console.error("[groq] request failed", { status: res.status, reason: lastFailure, message: message.slice(0, 200) });
        const retryAfter = Number(res.headers.get("retry-after"));
        if (Number.isFinite(retryAfter) && retryAfter > 0) waitMs = retryAfter * 1000;
        if (!retryable(lastFailure) || waitMs > MAX_RETRY_WAIT_MS) return null;
      } else {
        const choice = data?.choices?.[0];
        const text = choice?.message?.content?.trim();
        if (text && choice?.finish_reason !== "length") {
          lastFailure = null;
          return text;
        }
        lastFailure = "unknown";
        // Cut off at the limit: retry once with double the room; never return partial output.
        if (choice?.finish_reason !== "length" || attempt === MAX_ATTEMPTS) return null;
        maxTokens *= 2;
        continue;
      }
    } catch (e) {
      lastFailure = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError") ? "timeout" : "unknown";
      console.error("[groq] request error:", e instanceof Error ? e.name : "unknown");
    }
    if (attempt < MAX_ATTEMPTS) await new Promise((r) => setTimeout(r, waitMs));
  }
  return null;
}

const GROQ_STT_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
export const DEFAULT_GROQ_STT_MODEL = "whisper-large-v3-turbo";
const STT_TIMEOUT_MS = 30_000;

export function groqSttModel() {
  return process.env.GROQ_STT_MODEL?.trim() || DEFAULT_GROQ_STT_MODEL;
}

/**
 * Speech-to-text with Groq Whisper, used when the browser has no speech
 * recognition. Returns the transcript ("" for silence) or null on failure;
 * the reason is available from `lastGroqFailure()`. Audio is not stored.
 */
export async function groqTranscribe(audio: Blob, filename: string, context = ""): Promise<string | null> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;
  const form = new FormData();
  form.append("file", audio, filename);
  form.append("model", groqSttModel());
  form.append("language", "en");
  form.append("response_format", "json");
  form.append("temperature", "0");
  // Whisper's prompt biases spelling toward the topic (e.g. "Redis", not "readies"); it is capped at ~224 tokens.
  if (context.trim()) form.append("prompt", context.trim().slice(0, 600));
  try {
    const res = await fetch(GROQ_STT_URL, { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.timeout(STT_TIMEOUT_MS) });
    const data = (await res.json().catch(() => null)) as { text?: unknown; error?: { message?: string } } | null;
    if (!res.ok) {
      const message = String(data?.error?.message ?? "");
      lastFailure = classify(res.status, message);
      console.error("[groq] transcription failed", { status: res.status, reason: lastFailure, message: message.slice(0, 200) });
      return null;
    }
    if (typeof data?.text !== "string") {
      lastFailure = "unknown";
      return null;
    }
    lastFailure = null;
    return data.text.trim();
  } catch (e) {
    lastFailure = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError") ? "timeout" : "unknown";
    console.error("[groq] transcription error:", e instanceof Error ? e.name : "unknown");
    return null;
  }
}
