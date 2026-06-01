import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";
import { ObjectId } from "mongodb";

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const db = await getDb();
  if (!db) return Response.json({ ok: false, error: "Database not available" }, { status: 500 });

  try {
    const { id } = await props.params;

    if (!ObjectId.isValid(id)) {
      return Response.json({ ok: false, error: "Invalid contest ID" }, { status: 400 });
    }

    const contest = await db.collection("contests").findOne({ _id: new ObjectId(id) });
    if (!contest) {
      return Response.json({ ok: false, error: "Contest not found" }, { status: 404 });
    }

    // Check if already registered
    const existing = await db.collection("contest_registrations").findOne({
      userId: user.id,
      contestId: new ObjectId(id),
    });

    if (existing) {
      return Response.json({ ok: false, error: "Already registered for this contest" }, { status: 400 });
    }

    // Check max participants
    const registrationCount = await db.collection("contest_registrations").countDocuments({
      contestId: new ObjectId(id),
    });

    if (registrationCount >= (contest.maxParticipants || 1000)) {
      return Response.json({ ok: false, error: "Contest is full" }, { status: 400 });
    }

    // Register user
    const result = await db.collection("contest_registrations").insertOne({
      userId: user.id,
      contestId: new ObjectId(id),
      registeredAt: new Date(),
      score: null,
      status: "registered",
    });

    // Update contest participant count
    await db.collection("contests").updateOne({ _id: new ObjectId(id) }, { $inc: { participantCount: 1 } });

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
  if (!db) return Response.json({ ok: false, error: "Database not available" }, { status: 500 });

  try {
    const { id } = await props.params;

    if (!ObjectId.isValid(id)) {
      return Response.json({ ok: false, error: "Invalid contest ID" }, { status: 400 });
    }

    const contest = await db.collection("contests").findOne({ _id: new ObjectId(id) });
    if (!contest) {
      return Response.json({ ok: false, error: "Contest not found" }, { status: 404 });
    }

    const isRegistered = await db.collection("contest_registrations").findOne({
      userId: user.id,
      contestId: new ObjectId(id),
    });

    return Response.json({
      ok: true,
      contest: { ...contest, isRegistered: !!isRegistered },
    });
  } catch (error) {
    console.error("Error fetching contest:", error);
    return Response.json({ ok: false, error: "Failed to fetch contest" }, { status: 500 });
  }
}
