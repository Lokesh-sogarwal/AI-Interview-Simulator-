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

type HfInferenceTextGenResponse =
  | Array<{ generated_text?: unknown }>
  | { generated_text?: unknown }
  | { error?: unknown; estimated_time?: unknown }
  | unknown;

function logHfError(prefix: string, error: unknown) {
  const anyErr = error as
    | {
        message?: unknown;
        request?: unknown;
        response?: unknown;
        httpRequest?: unknown;
        httpResponse?: unknown;
        cause?: unknown;
      }
    | null
    | undefined;

  if (!anyErr || typeof anyErr !== "object") {
    console.error(prefix, error);
    return;
  }

  const keys = Object.getOwnPropertyNames(anyErr);
  const details = {
    message: typeof anyErr.message === "string" ? anyErr.message : undefined,
    keys,
    request: anyErr.request,
    response: anyErr.response,
    httpRequest: anyErr.httpRequest,
    httpResponse: anyErr.httpResponse,
    cause: anyErr.cause,
  };

  console.error(prefix, details);
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
    const chat = await chatCompletion({
      accessToken: key,
      model,
      provider: providerFromEnv,
      messages: [
        { role: "system", content: params.system },
        { role: "user", content: params.user },
      ],
      max_tokens: maxTokens,
      temperature,
    });

    const chatText = chat?.choices?.[0]?.message?.content;
    if (typeof chatText === "string" && chatText.trim()) return chatText.trim();
  } catch (e) {
    logHfError("[huggingface] chatCompletion exception", e);
  }

  try {
    const prompt = mistralInstructPrompt(params.system, params.user);
    const out = await textGeneration({
      accessToken: key,
      model,
      provider: providerForText,
      inputs: prompt,
      parameters: {
        max_new_tokens: maxTokens,
        temperature,
        return_full_text: false,
      },
    });

    const generated = (out as { generated_text?: unknown } | null)?.generated_text;
    if (typeof generated === "string" && generated.trim()) return generated.trim();
    return null;
  } catch (e) {
    logHfError("[huggingface] textGeneration exception", e);
    return null;
  }
}
