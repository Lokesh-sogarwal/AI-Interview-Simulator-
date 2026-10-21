import { getCurrentUser, isAdminInDb } from "@/lib/auth";
import { getDb, dbUnavailableMessage } from "@/lib/mongodb";
import { readJsonObject } from "@/lib/http";
import { problemSummary } from "@/lib/contests";
import { generateContestProblems } from "@/app/lib/problem-generator";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const db = await getDb();
  if (!db) return Response.json({ ok: false, error: dbUnavailableMessage() }, { status: 503 });

  try {
    const contests = await db
      .collection("contests")
      .find({})
      .sort({ startDate: -1 })
      .limit(100)
      .toArray();

    // Check which contests the user is registered for
    const registrations = await db
      .collection("contest_registrations")
      .find({ userId: user.id })
      .project({ contestId: 1 })
      .toArray();

    const registeredIds = new Set(registrations.map((r) => String(r.contestId)));

    // Real participant counts from registrations (the stored counter can drift).
    const counts = await db
      .collection("contest_registrations")
      .aggregate<{ _id: unknown; n: number }>([
        { $match: { contestId: { $in: contests.map((c) => c._id) } } },
        { $group: { _id: "$contestId", n: { $sum: 1 } } },
      ])
      .toArray();
    const countById = new Map(counts.map((c) => [String(c._id), c.n]));

    const enrichedContests = contests.map(({ problems, ...contest }) => ({
      ...contest,
      // Only titles/difficulty in listings; full statements come from /problems.
      problems: Array.isArray(problems) ? problems.map(problemSummary) : [],
      problemCount: Array.isArray(problems) ? problems.length : Number(contest.problemCount) || 0,
      isRegistered: registeredIds.has(String(contest._id)),
      participantCount: countById.get(String(contest._id)) ?? 0,
    }));

    return Response.json({ ok: true, contests: enrichedContests });
  } catch (error) {
    console.error("Error fetching contests:", error);
    return Response.json({ ok: false, error: "Failed to fetch contests" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const db = await getDb();
  if (!db) return Response.json({ ok: false, error: dbUnavailableMessage() }, { status: 503 });

  if (!(await isAdminInDb(db, user.id))) {
    return Response.json({ ok: false, error: "Only admins can create contests" }, { status: 403 });
  }

  try {
    const body = await readJsonObject<{
      name: string;
      description: string;
      startDate: string;
      endDate: string;
      rules: string;
      maxParticipants: number;
      problemCount: number;
      frequency: string;
    }>(request);
    if (!body) return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });

    const name = String(body.name ?? "").trim().slice(0, 120);
    const startDate = new Date(String(body.startDate ?? ""));
    const endDate = new Date(String(body.endDate ?? ""));
    if (!name || Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return Response.json({ ok: false, error: "Missing or invalid name, startDate or endDate." }, { status: 400 });
    }
    if (endDate <= startDate) {
      return Response.json({ ok: false, error: "endDate must be after startDate." }, { status: 400 });
    }
    const problemCount = Math.min(10, Math.max(1, Math.floor(Number(body.problemCount) || 3)));
    const maxParticipants = Math.min(100_000, Math.max(1, Math.floor(Number(body.maxParticipants) || 1000)));
    const frequency = body.frequency === "biweekly" ? "biweekly" : "weekly";

    const { problems, generatedAt, source } = await generateContestProblems(name, problemCount);

    const result = await db.collection("contests").insertOne({
      name,
      description: String(body.description ?? "").slice(0, 2000),
      startDate,
      endDate,
      rules: String(body.rules || "Complete all coding problems. Score is based on correctness.").slice(0, 4000),
      maxParticipants,
      createdBy: user.id,
      createdAt: new Date(),
      status: "upcoming",
      participantCount: 0,
      type: "coding",
      frequency,
      problems,
      problemCount: problems.length,
      problemSource: source,
      generatedAt,
    });

    return Response.json({ ok: true, id: result.insertedId, problemCount: problems.length, problemSource: source });
  } catch (error) {
    console.error("Error creating contest:", error);
    return Response.json({ ok: false, error: "Failed to create contest" }, { status: 500 });
  }
}
