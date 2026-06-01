import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { generateContestProblems } from "@/app/lib/problem-generator";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const db = await getDb();
  if (!db) return Response.json({ ok: false, error: "Database not available" }, { status: 500 });

  try {
    const contests = await db
      .collection("contests")
      .find({})
      .sort({ startDate: -1 })
      .toArray();

    // Check which contests the user is registered for
    const registrations = await db
      .collection("contest_registrations")
      .find({ userId: user.id })
      .project({ contestId: 1 })
      .toArray();

    const registeredIds = registrations.map((r) => String(r.contestId));

    const enrichedContests = contests.map((contest) => ({
      ...contest,
      isRegistered: registeredIds.includes(String(contest._id)),
      participantCount: 0, // Will be updated in query
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

  // Check if user is admin
  if (!user.isAdmin) {
    return Response.json({ ok: false, error: "Only admins can create contests" }, { status: 403 });
  }

  const db = await getDb();
  if (!db) return Response.json({ ok: false, error: "Database not available" }, { status: 500 });

  try {
    const body = await request.json();
    const { name, description, startDate, endDate, rules, maxParticipants, problemCount = 3, frequency = "weekly" } = body;

    if (!name || !startDate || !endDate) {
      return Response.json({ ok: false, error: "Missing required fields" }, { status: 400 });
    }

    // Generate coding problems using Hugging Face
    const { problems, generatedAt } = await generateContestProblems(name, problemCount);

    const result = await db.collection("contests").insertOne({
      name,
      description: description || "",
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      rules: rules || "Complete all coding problems. Score is based on correctness and efficiency.",
      maxParticipants: maxParticipants || 1000,
      createdBy: user.id,
      createdAt: new Date(),
      status: "upcoming",
      participantCount: 0,
      type: "coding", // New field to indicate coding contest
      frequency: frequency, // "weekly" or "biweekly"
      problems: problems, // Generated coding problems
      problemCount: problems.length,
      generatedAt: generatedAt,
    });

    return Response.json({ ok: true, id: result.insertedId, problemCount: problems.length });
  } catch (error) {
    console.error("Error creating contest:", error);
    return Response.json({ ok: false, error: "Failed to create contest" }, { status: 500 });
  }
}
