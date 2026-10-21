import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { readJsonObject } from "@/lib/http";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { MAX_CODE_BYTES, isSupportedLanguage, runTestCase } from "@/lib/codeRunner";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const rl = rateLimit(request, { keyPrefix: "code:execute", key: user.id, limit: 60, windowMs: 10 * 60 * 1000 });
  if (!rl.ok) return rateLimitResponse(rl.resetAt);

  const body = await readJsonObject<{ code: string; language: string; input: string; expectedOutput: string }>(request);
  if (!body) return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });

  const code = typeof body.code === "string" ? body.code : "";
  const input = typeof body.input === "string" ? body.input.slice(0, 10_000) : null;
  const { language } = body;

  if (!code.trim() || !language || input === null) {
    return NextResponse.json({ ok: false, error: "Missing required fields: code, language, input" }, { status: 400 });
  }
  if (!isSupportedLanguage(language)) {
    return NextResponse.json({ ok: false, error: "Unsupported language." }, { status: 400 });
  }
  if (new TextEncoder().encode(code).length > MAX_CODE_BYTES) {
    return NextResponse.json({ ok: false, error: "Code is too large (max 50KB)." }, { status: 413 });
  }

  const expected = typeof body.expectedOutput === "string" ? body.expectedOutput : "";
  const outcome = await runTestCase(code, language, { input, output: expected });
  if ("fatal" in outcome) {
    return NextResponse.json({ ok: false, error: outcome.fatal }, { status: outcome.status });
  }

  return NextResponse.json({
    ok: true,
    output: outcome.actual,
    error: outcome.error,
    ...(typeof body.expectedOutput === "string" ? { passed: outcome.passed } : {}),
  });
}
