import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";
import { calculateUserMetrics } from "@/app/lib/ranking-calculator";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { ok: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    const db = await getDb();
    if (!db) {
      return NextResponse.json(
        { ok: false, error: "Database not available" },
        { status: 503 }
      );
    }

    // Get user metrics
    const metrics = await calculateUserMetrics(user.id, db);

    // Get interview statistics
    const interviews = await db.collection("interviews").find({ userId: user.id }).toArray();
    
    // Get breakdown by difficulty
    const difficultyBreakdown = {
      easy: interviews.filter((i: any) => i.difficulty === "easy").length,
      medium: interviews.filter((i: any) => i.difficulty === "medium").length,
      hard: interviews.filter((i: any) => i.difficulty === "hard").length,
    };

    // Get breakdown by type
    const typeBreakdown = {
      hr: interviews.filter((i: any) => i.type === "hr").length,
      technical: interviews.filter((i: any) => i.type === "technical").length,
      behavioral: interviews.filter((i: any) => i.type === "behavioral").length,
    };

    // Get contest participation
    const contests = await db
      .collection("contest_registrations")
      .find({ userId: user.id })
      .toArray();

    // Get recent submissions
    const recentSubmissions = await db
      .collection("interviews")
      .find({ userId: user.id })
      .sort({ createdAt: -1 })
      .limit(5)
      .toArray();

    // Calculate acceptance rate
    const completedInterviews = interviews.filter((i: any) => i.totalScore > 0).length;
    const acceptanceRate = interviews.length > 0 
      ? Math.round((completedInterviews / interviews.length) * 100)
      : 0;

    // Get user rank
    const allUsers = await db.collection("leaderboard_cache").find({}).toArray();
    const userRank = allUsers.findIndex((entry: any) => entry.userId === user.id) + 1 || 0;

    // Get top categories (interview roles where user performed best)
    const roleScores: Record<string, { count: number; totalScore: number }> = {};
    interviews.forEach((i: any) => {
      const role = i.role || "Unknown";
      if (!roleScores[role]) {
        roleScores[role] = { count: 0, totalScore: 0 };
      }
      roleScores[role].count++;
      roleScores[role].totalScore += i.totalScore || 0;
    });

    const topRoles = Object.entries(roleScores)
      .map(([role, data]) => ({
        role,
        interviews: data.count,
        avgScore: Math.round(data.totalScore / data.count),
      }))
      .sort((a, b) => b.avgScore - a.avgScore)
      .slice(0, 5);

    return NextResponse.json({
      ok: true,
      profile: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          isAdmin: user.isAdmin || false,
        },
        metrics,
        stats: {
          totalInterviews: interviews.length,
          completedInterviews,
          acceptanceRate,
          totalContests: contests.length,
          rank: userRank,
        },
        breakdown: {
          byDifficulty: difficultyBreakdown,
          byType: typeBreakdown,
          byRole: topRoles,
        },
        recentSubmissions: recentSubmissions.map((i: any) => ({
          id: i._id,
          role: i.role,
          type: i.type,
          difficulty: i.difficulty,
          score: i.totalScore,
          createdAt: i.createdAt,
        })),
      },
    });
  } catch (error: any) {
    console.error("Error fetching profile:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Failed to fetch profile" },
      { status: 500 }
    );
  }
}
