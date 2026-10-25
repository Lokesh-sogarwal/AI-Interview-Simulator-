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
    stubFetch(429, { error: { message: "Rate limit exceeded: free-models-per-minute", code: 429 } });
    expect(await llmText({ system: "s", user: "u" })).toBeNull();
    expect(aiFailureDetail().reason).toBe("rate_limit");
    // The free daily cap does not clear by retrying, so it is reported as quota.
    stubFetch(429, { error: { message: "Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day", code: 429 } });
    expect(await llmText({ system: "s", user: "u" })).toBeNull();
    expect(aiFailureDetail().reason).toBe("quota");
  });

  it.each([[504], [503], [502]])("classifies a provider %s (even inside a 200 body) as a timeout", async (code) => {
    vi.stubEnv("OPENROUTER_API_KEY", "k");
    vi.stubEnv("HUGGINGFACE_API_KEY", "");
    stubFetch(200, { error: { message: "Provider timed out", code } });
    expect(await llmText({ system: "s", user: "u" })).toBeNull();
    expect(aiFailureDetail().reason).toBe("timeout");
  });
});

describe("free-only mode", () => {
  it("sends only :free models, even when a paid one is configured", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "k");
    vi.stubEnv("OPENROUTER_MODEL", "openai/gpt-paid,a:free,b:free");
    const fetchMock = stubFetch(200, { choices: [{ message: { content: "OK" } }] });
    expect(await llmText({ system: "s", user: "u", freeOnly: true })).toEqual({ text: "OK", provider: "openrouter" });
    const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect([body.model, ...(body.models ?? [])].every((m: string) => m.endsWith(":free"))).toBe(true);
    expect(body.model).toBe("a:free");
  });

  it("never falls back to Hugging Face or OpenAI", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "k");
    vi.stubEnv("HUGGINGFACE_API_KEY", "hf");
    vi.stubEnv("OPENAI_API_KEY", "oa");
    const fetchMock = stubFetch(429, { error: { message: "rate limited" } });
    expect(await llmText({ system: "s", user: "u", freeOnly: true })).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String((fetchMock.mock.calls[0] as unknown as [string])[0])).toContain("openrouter.ai");
  });

  it("returns null without an OpenRouter key instead of using a paid provider", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "oa");
    const fetchMock = stubFetch(200, {});
    expect(await llmText({ system: "s", user: "u", freeOnly: true })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
