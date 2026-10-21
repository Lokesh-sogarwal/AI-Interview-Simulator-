import { getCurrentUser } from "@/lib/auth";
import { getDb, isDuplicateKeyError, dbUnavailableMessage } from "@/lib/mongodb";
import { toObjectId } from "@/lib/http";
import { contestPhase, problemSummary } from "@/lib/contests";

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const db = await getDb();
  if (!db) return Response.json({ ok: false, error: dbUnavailableMessage() }, { status: 503 });

  try {
    const { id } = await props.params;
    const contestId = toObjectId(id);
    if (!contestId) {
      return Response.json({ ok: false, error: "Invalid contest ID" }, { status: 400 });
    }

    const contest = await db.collection("contests").findOne({ _id: contestId });
    if (!contest) {
      return Response.json({ ok: false, error: "Contest not found" }, { status: 404 });
    }
    if (contestPhase(contest) === "ended") {
      return Response.json({ ok: false, error: "This contest has ended." }, { status: 400 });
    }

    const registrations = db.collection("contest_registrations");
    const existing = await registrations.findOne({ userId: user.id, contestId });
    if (existing) {
      return Response.json({ ok: false, error: "Already registered for this contest" }, { status: 409 });
    }

    const registrationCount = await registrations.countDocuments({ contestId });
    if (registrationCount >= (contest.maxParticipants || 1000)) {
      return Response.json({ ok: false, error: "Contest is full" }, { status: 400 });
    }

    let result;
    try {
      result = await registrations.insertOne({
        userId: user.id,
        contestId,
        registeredAt: new Date(),
        score: 0,
        solvedCount: 0,
        status: "registered",
      });
    } catch (err) {
      // Concurrent double registration: the unique (contestId, userId) index rejects the second.
      if (isDuplicateKeyError(err)) {
        return Response.json({ ok: false, error: "Already registered for this contest" }, { status: 409 });
      }
      throw err;
    }

    await db.collection("contests").updateOne({ _id: contestId }, { $inc: { participantCount: 1 } });

    return Response.json({ ok: true, message: "Successfully registered for contest", registrationId: result.insertedId });
  } catch (error) {
    console.error("Error registering for contest:", error);
    return Response.json({ ok: false, error: "Failed to register for contest" }, { status: 500 });
  }
}

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const db = await getDb();
  if (!db) return Response.json({ ok: false, error: dbUnavailableMessage() }, { status: 503 });

  try {
    const { id } = await props.params;
    const contestId = toObjectId(id);
    if (!contestId) {
      return Response.json({ ok: false, error: "Invalid contest ID" }, { status: 400 });
    }

    const contest = await db.collection("contests").findOne({ _id: contestId });
    if (!contest) {
      return Response.json({ ok: false, error: "Contest not found" }, { status: 404 });
    }

    const [registration, participantCount, solved] = await Promise.all([
      db.collection("contest_registrations").findOne({ userId: user.id, contestId }),
      db.collection("contest_registrations").countDocuments({ contestId }),
      db.collection("contest_submissions").distinct("problemIndex", { userId: user.id, contestId, passed: true }),
    ]);

    const { problems, ...rest } = contest;
    return Response.json({
      ok: true,
      contest: {
        ...rest,
        problems: Array.isArray(problems) ? problems.map(problemSummary) : [],
        participantCount,
        isRegistered: !!registration,
        myScore: registration?.score ?? null,
        solvedProblems: solved,
        phase: contestPhase(contest),
      },
    });
  } catch (error) {
    console.error("Error fetching contest:", error);
    return Response.json({ ok: false, error: "Failed to fetch contest" }, { status: 500 });
  }
}
