import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_OPENROUTER_MODELS, lastOpenRouterFailure, openRouterModels, openRouterText } from "@/lib/openrouter";
import { aiFailureDetail, llmText } from "@/lib/llm";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function stubFetch(status: number, body: unknown) {
  const fn = vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("OpenRouter provider", () => {
  it("uses free default models with fallbacks and never sends the key anywhere but the header", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "sk-or-test");
    vi.stubEnv("OPENROUTER_MODEL", "");
    const fetchMock = stubFetch(200, { choices: [{ message: { content: " OK " } }] });
    expect(await openRouterText({ system: "s", user: "u", maxTokens: 50 })).toBe("OK");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe(DEFAULT_OPENROUTER_MODELS[0]);
    expect(body.models).toEqual(DEFAULT_OPENROUTER_MODELS);
    expect(body.models.every((m: string) => m.endsWith(":free"))).toBe(true);
    expect(body.max_tokens).toBeGreaterThanOrEqual(1500);
    expect(String(init.body)).not.toContain("sk-or-test");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-or-test");
  });

  it("parses a configured model list", () => {
    vi.stubEnv("OPENROUTER_MODEL", "a:free, b:free ,c:free,d:free");
    expect(openRouterModels()).toEqual(["a:free", "b:free", "c:free"]);
  });

  it.each([
    [429, "rate_limit"],
    [402, "quota"],
    [401, "auth"],
    [404, "model"],
  ])("classifies HTTP %s as %s and returns null", async (status, reason) => {
    vi.stubEnv("OPENROUTER_API_KEY", "k");
    stubFetch(status, { error: { message: "nope", code: status } });
    expect(await openRouterText({ system: "s", user: "u" })).toBeNull();
    expect(lastOpenRouterFailure()).toBe(reason);
  });

  it("is preferred over Hugging Face and explains failures", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "k");
    vi.stubEnv("HUGGINGFACE_API_KEY", "");
    stubFetch(200, { choices: [{ message: { content: "hello" } }] });
    expect(await llmText({ system: "s", user: "u" })).toEqual({ text: "hello", provider: "openrouter" });
    stubFetch(429, { error: { message: "Rate limit exceeded: free-models-per-day", code: 429 } });
    expect(await llmText({ system: "s", user: "u" })).toBeNull();
    expect(aiFailureDetail().reason).toBe("rate_limit");
  });
});
