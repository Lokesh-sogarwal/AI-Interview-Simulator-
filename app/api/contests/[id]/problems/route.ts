import { NextResponse } from "next/server";
import { getCurrentUser, isAdminInDb } from "@/lib/auth";
import { getDb, dbUnavailableMessage } from "@/lib/mongodb";
import { toObjectId } from "@/lib/http";
import { contestPhase, publicProblem } from "@/lib/contests";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const problemIndex = Number.parseInt(searchParams.get("index") || "0", 10);

    const contestId = toObjectId(id);
    if (!contestId) {
      return NextResponse.json({ ok: false, error: "Invalid contest ID" }, { status: 400 });
    }

    const db = await getDb();
    if (!db) {
      return NextResponse.json({ ok: false, error: dbUnavailableMessage() }, { status: 503 });
    }

    const contest = await db.collection("contests").findOne({ _id: contestId });
    if (!contest) {
      return NextResponse.json({ ok: false, error: "Contest not found" }, { status: 404 });
    }

    // Problem statements stay hidden until the contest starts (admins can preview).
    if (contestPhase(contest) === "upcoming" && !(await isAdminInDb(db, user.id))) {
      return NextResponse.json({ ok: false, error: "This contest has not started yet." }, { status: 403 });
    }

    if (!Array.isArray(contest.problems) || contest.problems.length === 0) {
      return NextResponse.json({ ok: false, error: "No problems in this contest" }, { status: 404 });
    }

    if (!Number.isInteger(problemIndex) || problemIndex < 0 || problemIndex >= contest.problems.length) {
      return NextResponse.json({ ok: false, error: "Problem index out of range" }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      problem: publicProblem(contest.problems[problemIndex]),
      problemNumber: problemIndex + 1,
      totalProblems: contest.problems.length,
      phase: contestPhase(contest),
      endDate: contest.endDate ?? null,
    });
  } catch (error) {
    console.error("Error fetching problem:", error);
    return NextResponse.json({ ok: false, error: "Failed to fetch problem" }, { status: 500 });
  }
}
