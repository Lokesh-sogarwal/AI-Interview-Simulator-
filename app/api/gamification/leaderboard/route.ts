import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";

export async function GET(request: Request) {
  try {
    const db = await getDb();
    if (!db) return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });

    const users = db.collection("users");
    
    // Fetch top users by points (leaderboard)
    const topUsers = await users
      .aggregate([
        {
          $project: {
            username: { $ifNull: ["$username", "Anonymous"] },
            points: { $ifNull: ["$points", 0] },
            level: { $ifNull: ["$level", 1] },
            totalInterviews: { $ifNull: ["$totalInterviews", 0] },
            streak: { $ifNull: ["$streak", 0] },
            badges: { $ifNull: ["$badges", []] },
          },
        },
        { $sort: { points: -1 } },
        { $limit: 100 },
      ])
      .toArray();

    const leaderboard = topUsers.map((user, index) => ({
      rank: index + 1,
      username: user.username,
      points: user.points,
      level: user.level,
      totalInterviews: user.totalInterviews,
      streak: user.streak,
      badgeCount: (user.badges || []).length,
    }));

    return NextResponse.json({
      ok: true,
      leaderboard,
      updatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Failed to fetch leaderboard" },
      { status: 500 }
    );
  }
}
