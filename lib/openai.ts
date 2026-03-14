type OpenAIResponse = {
  output_text?: string;
  output?: unknown;
};

export function hasOpenAIKey() {
  return Boolean(process.env.OPENAI_API_KEY);
}

export async function openaiText(params: {
  system: string;
  user: string;
  model?: string;
}): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;

  const model = params.model || process.env.OPENAI_MODEL || "gpt-4.1-mini";

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [
        { role: "system", content: [{ type: "text", text: params.system }] },
        { role: "user", content: [{ type: "text", text: params.user }] },
      ],
      temperature: 0.4,
    }),
  });

  if (!response.ok) return null;
  const data = (await response.json()) as OpenAIResponse;
  const text = typeof data.output_text === "string" ? data.output_text : "";
  return text.trim() || null;
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
