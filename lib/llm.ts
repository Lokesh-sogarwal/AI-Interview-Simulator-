import { huggingfaceText, hasHuggingFaceKey } from "@/lib/huggingface";
import { hasOpenAIKey, openaiText } from "@/lib/openai";

export type LLMProvider = "huggingface" | "openai";

export type LLMModels = Partial<Record<LLMProvider, string>>;

export async function llmText(params: {
  system: string;
  user: string;
  models?: LLMModels;
}): Promise<{ text: string; provider: LLMProvider } | null> {
  // Prefer Hugging Face if configured.
  if (hasHuggingFaceKey()) {
    const text = await huggingfaceText({
      system: params.system,
      user: params.user,
      model: params.models?.huggingface,
    });
    if (text) return { text, provider: "huggingface" };
  }

  if (hasOpenAIKey()) {
    const text = await openaiText({
      system: params.system,
      user: params.user,
      model: params.models?.openai,
    });
    if (text) return { text, provider: "openai" };
  }

  return null;
}
