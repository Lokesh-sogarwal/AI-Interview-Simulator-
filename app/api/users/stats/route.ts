import { getCurrentUser } from "@/lib/auth";
import { getDb, dbUnavailableMessage } from "@/lib/mongodb";
import { calculateUserMetrics, getRatingRank } from "@/app/lib/ranking-calculator";
import { displayName } from "@/lib/contests";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const db = await getDb();
  if (!db) return Response.json({ ok: false, error: dbUnavailableMessage() }, { status: 503 });

  try {
    const [metrics, rank, contestsCompleted] = await Promise.all([
      calculateUserMetrics(user.id, db),
      getRatingRank(user.id, db),
      db.collection("contest_registrations").countDocuments({ userId: user.id, status: "completed" }),
    ]);

    return Response.json({
      ok: true,
      stats: {
        rating: metrics.eloRating,
        contestsCompleted,
        contestsEntered: metrics.contestCount,
        totalScore: metrics.totalScore,
        averageContestScore: metrics.contestScore,
        contestWins: metrics.contestWins,
        rank: rank?.rank ?? 0,
        totalRanked: rank?.total ?? 0,
        username: displayName(user),
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Error fetching user stats:", error);
    return Response.json({ ok: false, error: "Failed to fetch stats" }, { status: 500 });
  }
}
