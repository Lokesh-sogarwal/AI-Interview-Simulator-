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
    const body = await request.json();
    const { score, interviewId } = body;

    if (!ObjectId.isValid(id)) {
      return Response.json({ ok: false, error: "Invalid contest ID" }, { status: 400 });
    }

    if (typeof score !== "number" || score < 0 || score > 100) {
      return Response.json({ ok: false, error: "Invalid score" }, { status: 400 });
    }

    // Update registration with score
    const result = await db.collection("contest_registrations").updateOne(
      { userId: user.id, contestId: new ObjectId(id) },
      {
        $set: {
          score,
          status: "completed",
          completedAt: new Date(),
          interviewId: interviewId || null,
        },
      },
    );

    if (result.matchedCount === 0) {
      return Response.json({ ok: false, error: "Registration not found" }, { status: 404 });
    }

    // Calculate user's rating
    const registration = await db.collection("contest_registrations").findOne({
      userId: user.id,
      contestId: new ObjectId(id),
    });

    // Get user's rank
    const rank = await db.collection("contest_registrations").countDocuments({
      contestId: new ObjectId(id),
      score: { $gt: score },
    });

    const baseRating = 1200;
    const scoreBonus = score * 10;
    const performanceBonus = Math.max(0, (100 - rank) * 5);
    const rating = Math.round(baseRating + scoreBonus + performanceBonus);

    // Update user's overall rating
    await db.collection("users").updateOne(
      { id: user.id },
      {
        $set: { rating: rating },
        $inc: { contestsCompleted: 1 },
      },
    );

    return Response.json({
      ok: true,
      rating,
      rank: rank + 1,
      message: "Score recorded successfully",
    });
  } catch (error) {
    console.error("Error recording contest score:", error);
    return Response.json({ ok: false, error: "Failed to record score" }, { status: 500 });
  }
}
