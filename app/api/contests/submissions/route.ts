import { NextResponse } from "next/server";
import { getDb, dbUnavailableMessage } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { readJsonObject, toObjectId } from "@/lib/http";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { MAX_CODE_BYTES, isSupportedLanguage, runTestCase, type TestOutcome } from "@/lib/codeRunner";
import { contestPhase, judgeCases, recomputeRegistrationScore } from "@/lib/contests";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const rl = rateLimit(request, { keyPrefix: "contests:submit", key: user.id, limit: 30, windowMs: 10 * 60 * 1000 });
    if (!rl.ok) return rateLimitResponse(rl.resetAt);

    const db = await getDb();
    if (!db) {
      return NextResponse.json({ ok: false, error: dbUnavailableMessage() }, { status: 503 });
    }

    const body = await readJsonObject<{ contestId: string; problemIndex: number; code: string; language: string }>(request);
    if (!body) return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });

    const contestId = toObjectId(body.contestId);
    const problemIndex = Number(body.problemIndex);
    const code = typeof body.code === "string" ? body.code : "";
    const { language } = body;

    if (!contestId || !Number.isInteger(problemIndex) || problemIndex < 0 || !code.trim() || !language) {
      return NextResponse.json({ ok: false, error: "Missing or invalid fields" }, { status: 400 });
    }
    if (!isSupportedLanguage(language)) {
      return NextResponse.json({ ok: false, error: "Unsupported language." }, { status: 400 });
    }
    if (new TextEncoder().encode(code).length > MAX_CODE_BYTES) {
      return NextResponse.json({ ok: false, error: "Code is too large (max 50KB)." }, { status: 413 });
    }

    const contest = await db.collection("contests").findOne({ _id: contestId });
    if (!contest) return NextResponse.json({ ok: false, error: "Contest not found" }, { status: 404 });

    const phase = contestPhase(contest);
    if (phase !== "active") {
      return NextResponse.json(
        { ok: false, error: phase === "ended" ? "This contest has ended; submissions are closed." : "This contest has not started yet." },
        { status: 403 },
      );
    }

    const registration = await db.collection("contest_registrations").findOne({ userId: user.id, contestId });
    if (!registration) {
      return NextResponse.json({ ok: false, error: "Register for this contest before submitting." }, { status: 403 });
    }

    const problems = Array.isArray(contest.problems) ? contest.problems : [];
    const problem = problems[problemIndex];
    if (!problem) return NextResponse.json({ ok: false, error: "Problem not found" }, { status: 404 });

    // Judge on the server: the client no longer decides whether tests passed.
    const cases = judgeCases(problem);
    if (cases.length === 0) {
      return NextResponse.json({ ok: false, error: "This problem has no test cases to judge against." }, { status: 422 });
    }
    const results: TestOutcome[] = [];
    for (const testCase of cases) {
      const outcome = await runTestCase(code, language, testCase);
      if ("fatal" in outcome) {
        return NextResponse.json({ ok: false, error: outcome.fatal }, { status: outcome.status });
      }
      results.push(outcome);
    }
    const passed = results.every((r) => r.passed);
    const exampleCount = Array.isArray(problem.examples) ? problem.examples.length : 0;

    const now = new Date();
    const submission = await db.collection("contest_submissions").insertOne({
      userId: user.id,
      contestId,
      problemIndex,
      code,
      language,
      passed,
      passedCount: results.filter((r) => r.passed).length,
      totalCount: results.length,
      createdAt: now,
      updatedAt: now,
    });

    const score = await recomputeRegistrationScore(db, contest as typeof contest & { _id: typeof contestId }, user.id);

    return NextResponse.json({
      ok: true,
      submissionId: submission.insertedId,
      passed,
      passedCount: results.filter((r) => r.passed).length,
      totalCount: results.length,
      // Only reveal details for public examples, not hidden tests.
      results: results.slice(0, exampleCount),
      score: score.score,
      solvedCount: score.solvedCount,
      message: passed ? "All tests passed! Solution accepted." : "Submission recorded, but some tests failed.",
    });
  } catch (error) {
    console.error("Error saving submission:", error);
    return NextResponse.json({ ok: false, error: "Failed to save submission" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const db = await getDb();
    if (!db) {
      return NextResponse.json({ ok: false, error: dbUnavailableMessage() }, { status: 503 });
    }

    const { searchParams } = new URL(request.url);
    const contestId = toObjectId(searchParams.get("contestId"));
    const problemIndex = Number.parseInt(searchParams.get("problemIndex") ?? "", 10);

    if (!contestId || !Number.isInteger(problemIndex) || problemIndex < 0) {
      return NextResponse.json({ ok: false, error: "Missing or invalid contestId or problemIndex" }, { status: 400 });
    }

    // Latest submission for this problem (not an arbitrary one).
    const submission = await db
      .collection("contest_submissions")
      .find({ userId: user.id, contestId, problemIndex })
      .sort({ createdAt: -1 })
      .limit(1)
      .next();

    if (!submission) {
      return NextResponse.json({ ok: true, submission: null, message: "No previous submission found" });
    }

    return NextResponse.json({
      ok: true,
      submission: {
        id: submission._id,
        code: submission.code,
        language: submission.language,
        passed: submission.passed,
        createdAt: submission.createdAt,
      },
    });
  } catch (error) {
    console.error("Error fetching submission:", error);
    return NextResponse.json({ ok: false, error: "Failed to fetch submission" }, { status: 500 });
  }
}
