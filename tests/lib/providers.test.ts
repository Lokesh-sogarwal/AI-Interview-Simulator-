import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Gemini SDK stand-in: tests script `generateContent` per case. No real API calls are made.
const gemini = vi.hoisted(() => ({ generateContent: vi.fn(), constructed: [] as unknown[] }));
vi.mock("@google/genai", () => {
  class ApiError extends Error {
    status: number;
    constructor(o: { message: string; status: number }) {
      super(o.message);
      this.status = o.status;
    }
  }
  class GoogleGenAI {
    models = { generateContent: gemini.generateContent };
    constructor(opts: unknown) {
      gemini.constructed.push(opts);
    }
  }
  return { ApiError, GoogleGenAI, ThinkingLevel: { LOW: "LOW", MINIMAL: "MINIMAL" } };
});

import { ApiError } from "@google/genai";
import { DEFAULT_GEMINI_MODEL, geminiText, lastGeminiFailure } from "@/lib/gemini";
import { DEFAULT_GROQ_MODEL, groqText, lastGroqFailure } from "@/lib/groq";
import { aiFailureDetail, llmText } from "@/lib/llm";

type FetchCall = [string, RequestInit];

function stubFetchSequence(...responses: Array<{ status: number; body: unknown; headers?: Record<string, string> }>) {
  const fn = vi.fn(async () => {
    const r = responses.length > 1 ? responses.shift()! : responses[0];
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { "Content-Type": "application/json", ...(r.headers ?? {}) } });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

const groqOk = (content: string, finish = "stop") => ({ status: 200, body: { choices: [{ message: { content }, finish_reason: finish }] } });
const geminiOk = (text: string, finishReason = "STOP") => ({ text, candidates: [{ finishReason }] });

/** Runs a call whose retries wait on timers, without real sleeps. */
async function withTimers<T>(fn: () => Promise<T>) {
  vi.useFakeTimers({ toFake: ["setTimeout"] });
  try {
    const p = fn();
    await vi.runAllTimersAsync();
    return await p;
  } finally {
    vi.useRealTimers();
  }
}

beforeEach(() => {
  gemini.generateContent.mockReset();
  gemini.constructed = [];
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Groq question generation", () => {
  beforeEach(() => vi.stubEnv("GROQ_API_KEY", "gsk-test"));

  it("calls the configured model with the key only in the header", async () => {
    const fetchMock = stubFetchSequence(groqOk(" What is a closure? "));
    expect(await groqText({ system: "s", user: "u" })).toBe("What is a closure?");
    const [url, init] = fetchMock.mock.calls[0] as unknown as FetchCall;
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe(DEFAULT_GROQ_MODEL);
    expect(body.response_format).toBeUndefined();
    expect(String(init.body)).not.toContain("gsk-test");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer gsk-test");
  });

  it("uses GROQ_MODEL and JSON mode when asked", async () => {
    vi.stubEnv("GROQ_MODEL", "openai/gpt-oss-20b");
    const fetchMock = stubFetchSequence(groqOk('{"a":1}'));
    await groqText({ system: "s", user: "Reply in JSON", json: true });
    const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown as FetchCall)[1].body));
    expect(body.model).toBe("openai/gpt-oss-20b");
    expect(body.response_format).toEqual({ type: "json_object" });
  });

  it("retries a per-minute rate limit once", async () => {
    const fetchMock = stubFetchSequence({ status: 429, body: { error: { message: "Rate limit reached: requests per minute (RPM)" } }, headers: { "retry-after": "1" } }, groqOk("Q?"));
    expect(await withTimers(() => groqText({ system: "s", user: "u" }))).toBe("Q?");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    [429, "Rate limit reached for model on tokens per day (TPD)", "quota"],
    [401, "Invalid API Key", "auth"],
    [404, "The model does not exist", "model"],
  ])("does not retry HTTP %s and reports %s", async (status, message, reason) => {
    const fetchMock = stubFetchSequence({ status, body: { error: { message } } });
    expect(await groqText({ system: "s", user: "u" })).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(lastGroqFailure()).toBe(reason);
  });

  it("gives up after a bounded number of server errors", async () => {
    const fetchMock = stubFetchSequence({ status: 503, body: { error: { message: "over capacity" } } });
    expect(await withTimers(() => groqText({ system: "s", user: "u" }))).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(lastGroqFailure()).toBe("timeout");
  });

  it("keeps reasoning short for gpt-oss models only", async () => {
    vi.stubEnv("GROQ_MODEL", "openai/gpt-oss-120b");
    let fetchMock = stubFetchSequence(groqOk("Q?"));
    await groqText({ system: "s", user: "u" });
    expect(JSON.parse(String((fetchMock.mock.calls[0] as unknown as FetchCall)[1].body)).reasoning_effort).toBe("low");
    vi.stubEnv("GROQ_MODEL", "llama-3.3-70b-versatile");
    fetchMock = stubFetchSequence(groqOk("Q?"));
    await groqText({ system: "s", user: "u" });
    expect(JSON.parse(String((fetchMock.mock.calls[0] as unknown as FetchCall)[1].body)).reasoning_effort).toBeUndefined();
  });

  it("sends the output limit as max_completion_tokens", async () => {
    const fetchMock = stubFetchSequence(groqOk("Q?"));
    await groqText({ system: "s", user: "u", maxTokens: 350 });
    const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown as FetchCall)[1].body));
    expect(body.max_completion_tokens).toBe(350);
    expect(body.max_tokens).toBeUndefined();
  });

  it("retries truncated output once with double the room, then gives up", async () => {
    const fetchMock = stubFetchSequence(groqOk("What is a clos", "length"), groqOk("What is a closure?"));
    expect(await groqText({ system: "s", user: "u", maxTokens: 100 })).toBe("What is a closure?");
    expect(fetchMock.mock.calls.map((c) => JSON.parse(String((c as unknown as FetchCall)[1].body)).max_completion_tokens)).toEqual([100, 200]);
    stubFetchSequence(groqOk("What is a clos", "length"));
    expect(await groqText({ system: "s", user: "u" })).toBeNull();
  });

  it("handles client timeouts", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(Object.assign(new Error("timed out"), { name: "TimeoutError" }))));
    expect(await withTimers(() => groqText({ system: "s", user: "u" }))).toBeNull();
    expect(lastGroqFailure()).toBe("timeout");
  });
});

describe("Gemini evaluation", () => {
  beforeEach(() => vi.stubEnv("GEMINI_API_KEY", "gem-test"));

  it("requests structured JSON from the configured Flash model with minimal thinking and the caller's output limit", async () => {
    gemini.generateContent.mockResolvedValue(geminiOk('{"ok":true}'));
    const schema = { type: "object", properties: { ok: { type: "boolean" } } };
    expect(await geminiText({ system: "rubric", user: "answer", jsonSchema: schema, maxTokens: 320 })).toBe('{"ok":true}');
    const req = gemini.generateContent.mock.calls[0][0];
    expect(req.model).toBe(DEFAULT_GEMINI_MODEL);
    expect(req.contents).toBe("answer");
    expect(req.config).toMatchObject({ systemInstruction: "rubric", maxOutputTokens: 320, responseMimeType: "application/json", responseJsonSchema: schema, thinkingConfig: { thinkingLevel: "MINIMAL" } });
    expect(req.config.abortSignal).toBeInstanceOf(AbortSignal);
    expect(gemini.constructed[0]).toEqual({ apiKey: "gem-test" });
  });

  it("uses GEMINI_THINKING_LEVEL for models without a minimal level", async () => {
    vi.stubEnv("GEMINI_THINKING_LEVEL", "low");
    gemini.generateContent.mockResolvedValue(geminiOk("x"));
    await geminiText({ system: "s", user: "u" });
    expect(gemini.generateContent.mock.calls[0][0].config.thinkingConfig).toEqual({ thinkingLevel: "LOW" });
  });

  it("retries a reply cut off at the limit once with double the room, never returning partial JSON", async () => {
    gemini.generateContent.mockResolvedValueOnce(geminiOk('{"technical_score": 7, "stren', "MAX_TOKENS")).mockResolvedValueOnce(geminiOk('{"ok":true}'));
    expect(await geminiText({ system: "s", user: "u", maxTokens: 300 })).toBe('{"ok":true}');
    expect(gemini.generateContent.mock.calls.map(([r]) => r.config.maxOutputTokens)).toEqual([300, 600]);
  });

  it("gives up after one truncation retry", async () => {
    gemini.generateContent.mockResolvedValue(geminiOk('{"partial":', "MAX_TOKENS"));
    expect(await geminiText({ system: "s", user: "u", maxTokens: 300 })).toBeNull();
    expect(gemini.generateContent).toHaveBeenCalledTimes(2);
  });

  it("uses GEMINI_MODEL and reuses one client", async () => {
    vi.stubEnv("GEMINI_MODEL", "gemini-3.6-flash");
    gemini.generateContent.mockResolvedValue(geminiOk("x"));
    await geminiText({ system: "s", user: "u" });
    await geminiText({ system: "s", user: "u" });
    expect(gemini.generateContent.mock.calls.every(([r]) => r.model === "gemini-3.6-flash")).toBe(true);
    expect(gemini.constructed.length).toBeLessThanOrEqual(1);
  });

  it("retries a per-minute 429 once", async () => {
    gemini.generateContent
      .mockRejectedValueOnce(new ApiError({ message: "RESOURCE_EXHAUSTED: GenerateRequestsPerMinutePerProjectPerModel-FreeTier", status: 429 }))
      .mockResolvedValueOnce(geminiOk("done"));
    expect(await withTimers(() => geminiText({ system: "s", user: "u" }))).toBe("done");
    expect(gemini.generateContent).toHaveBeenCalledTimes(2);
  });

  it.each([
    [429, "RESOURCE_EXHAUSTED: GenerateRequestsPerDayPerProjectPerModel-FreeTier", "quota"],
    [400, "API key not valid. Please pass a valid API key.", "auth"],
    [404, "models/gemini-x is not found", "model"],
  ])("does not retry HTTP %s and reports %s", async (status, message, reason) => {
    gemini.generateContent.mockRejectedValue(new ApiError({ message, status }));
    expect(await geminiText({ system: "s", user: "u" })).toBeNull();
    expect(gemini.generateContent).toHaveBeenCalledTimes(1);
    expect(lastGeminiFailure()).toBe(reason);
  });

  it("gives up after a bounded number of overload errors", async () => {
    gemini.generateContent.mockRejectedValue(new ApiError({ message: "UNAVAILABLE: model overloaded", status: 503 }));
    expect(await withTimers(() => geminiText({ system: "s", user: "u" }))).toBeNull();
    expect(gemini.generateContent).toHaveBeenCalledTimes(2);
    expect(lastGeminiFailure()).toBe("timeout");
  });

  it.each([[geminiOk('{"partial":', "MAX_TOKENS")], [{ text: "", candidates: [{ finishReason: "SAFETY" }] }]])("rejects truncated or empty output", async (res) => {
    gemini.generateContent.mockResolvedValue(res);
    expect(await geminiText({ system: "s", user: "u" })).toBeNull();
  });
});

describe("task routing", () => {
  it("sends question generation to Groq only, with no silent fallback", async () => {
    vi.stubEnv("GROQ_API_KEY", "g");
    vi.stubEnv("OPENROUTER_API_KEY", "or");
    const fetchMock = stubFetchSequence({ status: 401, body: { error: { message: "Invalid API Key" } } });
    expect(await llmText({ system: "s", user: "u", task: "question" })).toBeNull();
    expect(fetchMock.mock.calls.map((c) => String((c as unknown as FetchCall)[0]))).toEqual(["https://api.groq.com/openai/v1/chat/completions"]);
    expect(aiFailureDetail().reason).toBe("auth");
    expect(gemini.generateContent).not.toHaveBeenCalled();
  });

  it("sends evaluation to Gemini only, with no silent fallback", async () => {
    vi.stubEnv("GEMINI_API_KEY", "gm");
    vi.stubEnv("GROQ_API_KEY", "g");
    vi.stubEnv("OPENROUTER_API_KEY", "or");
    const fetchMock = stubFetchSequence(groqOk("should not be used"));
    gemini.generateContent.mockResolvedValueOnce(geminiOk("{}"));
    expect(await llmText({ system: "s", user: "u", task: "evaluation", freeOnly: true })).toEqual({ text: "{}", provider: "gemini" });
    gemini.generateContent.mockRejectedValueOnce(new ApiError({ message: "GenerateRequestsPerDayPerProjectPerModel-FreeTier", status: 429 }));
    expect(await llmText({ system: "s", user: "u", task: "evaluation" })).toBeNull();
    expect(aiFailureDetail().reason).toBe("quota");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the existing provider chain when the dedicated key is not configured", async () => {
    vi.stubEnv("GROQ_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("OPENROUTER_API_KEY", "or");
    const fetchMock = stubFetchSequence({ status: 200, body: { choices: [{ message: { content: "chain" } }] } });
    expect(await llmText({ system: "s", user: "u", task: "question" })).toEqual({ text: "chain", provider: "openrouter" });
    expect(String((fetchMock.mock.calls[0] as unknown as FetchCall)[0])).toContain("openrouter.ai");
  });
});
