type OpenAIResponse = {
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
};

const OPENAI_TIMEOUT_MS = 30_000;

export function hasOpenAIKey() {
  return Boolean(process.env.OPENAI_API_KEY);
}

function extractOutputText(data: OpenAIResponse) {
  if (typeof data.output_text === "string" && data.output_text.trim()) return data.output_text;
  // The raw REST API (unlike the SDK) does not always include `output_text`.
  const parts =
    data.output
      ?.flatMap((item) => item.content ?? [])
      .filter((c) => c.type === "output_text" && typeof c.text === "string")
      .map((c) => c.text as string) ?? [];
  return parts.join("");
}

export async function openaiText(params: {
  system: string;
  user: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;

  const model = params.model || process.env.OPENAI_MODEL || "gpt-4.1-mini";

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: [
          { role: "system", content: [{ type: "input_text", text: params.system }] },
          { role: "user", content: [{ type: "input_text", text: params.user }] },
        ],
        temperature: 0.4,
      }),
      signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.error(`[openai] request failed with status ${response.status}`);
      return null;
    }
    const data = (await response.json()) as OpenAIResponse;
    return extractOutputText(data).trim() || null;
  } catch (e) {
    console.error("[openai] request error:", e instanceof Error ? e.name : "unknown");
    return null;
  }
}

export function safeJsonParse<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    // Try to salvage: find first JSON object.
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;
    const slice = text.slice(start, end + 1);
    try {
      return JSON.parse(slice) as T;
    } catch {
      return null;
    }
  }
}
