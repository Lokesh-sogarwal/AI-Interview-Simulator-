import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const db = await getDb();
  if (!db) return Response.json({ ok: false, error: "Database not available" }, { status: 500 });

  try {
    const userDoc = await db.collection("users").findOne({ id: user.id });

    if (!userDoc) {
      return Response.json({
        ok: true,
        stats: {
          rating: 1200,
          contestsCompleted: 0,
          totalScore: 0,
          rank: 0,
          username: user.email?.split("@")[0] || "Anonymous",
          email: user.email,
        },
      });
    }

    // Get user's global rank
    const rank = await db.collection("users").countDocuments({
      rating: { $gt: userDoc.rating || 1200 },
    });

    return Response.json({
      ok: true,
      stats: {
        rating: userDoc.rating || 1200,
        contestsCompleted: userDoc.contestsCompleted || 0,
        totalScore: userDoc.totalScore || 0,
        rank: rank + 1,
        username: userDoc.email?.split("@")[0] || "Anonymous",
        email: userDoc.email,
      },
    });
  } catch (error) {
    console.error("Error fetching user stats:", error);
    return Response.json({ ok: false, error: "Failed to fetch stats" }, { status: 500 });
  }
}
