import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";
import { getGlobalLeaderboard, getUserRank } from "@/app/lib/ranking-calculator";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const db = await getDb();
  if (!db) return Response.json({ ok: false, error: "Database not available" }, { status: 500 });

  try {
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get("page") || "1");
    const limit = parseInt(url.searchParams.get("limit") || "50");

    if (page < 1 || limit < 1 || limit > 100) {
      return Response.json({ ok: false, error: "Invalid pagination parameters" }, { status: 400 });
    }

    // Get global leaderboard
    const { entries, total } = await getGlobalLeaderboard(db, page, limit);

    // Get current user's rank
    const userRank = await getUserRank(user.id, db);

    return Response.json({
      ok: true,
      leaderboard: entries,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      userRank: userRank?.rank || null,
      userTotalRank: userRank?.total || null,
    });
  } catch (error) {
    console.error("Error fetching global leaderboard:", error);
    return Response.json({ ok: false, error: "Failed to fetch leaderboard" }, { status: 500 });
  }
}
