import { NextResponse } from "next/server";
import { getDb, dbUnavailableMessage } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { calculateUserMetrics } from "@/app/lib/ranking-calculator";
import { summarizePerformance } from "@/lib/performance";

/** Performance summary on a 0-10 scale, computed only from the user's own completed interviews. */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });

    const db = await getDb();
    if (!db) return NextResponse.json({ ok: false, error: dbUnavailableMessage() }, { status: 503 });

    const [docs, totalSessions, dynamicMetrics] = await Promise.all([
      db
        .collection("interviews")
        .find(
          // Completed live sessions, plus legacy saves that predate `status`.
          { userId: user.id, $or: [{ status: "completed" }, { status: { $exists: false } }] },
          { projection: { averageScore: 1, totalScore: 1, breakdown: 1, "turns.evaluation": 1, "transcript.evaluation": 1, createdAt: 1, completedAt: 1, role: 1, type: 1 } },
        )
        .sort({ createdAt: -1 })
        .limit(200)
        .toArray(),
      db.collection("interviews").countDocuments({ userId: user.id, status: { $ne: "scheduled" } }),
      calculateUserMetrics(user.id, db),
    ]);

    return NextResponse.json({
      ok: true,
      totalInterviews: docs.length,
      totalSessions,
      ...summarizePerformance(docs),
      dynamicMetrics,
    });
  } catch (err) {
    console.error("[performance]", err);
    return NextResponse.json({ ok: false, error: "Failed to fetch performance" }, { status: 500 });
  }
}
