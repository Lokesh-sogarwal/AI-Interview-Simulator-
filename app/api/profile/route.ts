import { getCurrentUser } from "@/lib/auth";
import { getDb, dbUnavailableMessage } from "@/lib/mongodb";
import { calculateUserMetrics, getUserRank, interviewScore100 } from "@/app/lib/ranking-calculator";
import { NextResponse } from "next/server";

export async function GET() {
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
        { ok: false, error: dbUnavailableMessage() },
        { status: 503 }
      );
    }

    // Get user metrics
    const metrics = await calculateUserMetrics(user.id, db);

    // Get interview statistics
    const interviews = await db
      .collection("interviews")
      .find({ userId: user.id }, { projection: { difficulty: 1, type: 1, role: 1, status: 1, averageScore: 1, totalScore: 1, createdAt: 1 } })
      .sort({ createdAt: -1 })
      .limit(1000)
      .toArray();
    const lower = (v: unknown) => String(v ?? "").toLowerCase();
    
    // Get breakdown by difficulty
    const difficultyBreakdown = {
      easy: interviews.filter((i) => lower(i.difficulty) === "easy").length,
      medium: interviews.filter((i) => lower(i.difficulty) === "medium").length,
      hard: interviews.filter((i) => lower(i.difficulty) === "hard").length,
      adaptive: interviews.filter((i) => lower(i.difficulty) === "adaptive").length,
    };

    // Get breakdown by type
    const typeBreakdown = {
      hr: interviews.filter((i) => lower(i.type) === "hr").length,
      technical: interviews.filter((i) => lower(i.type) === "technical").length,
      mixed: interviews.filter((i) => lower(i.type) === "mixed").length,
    };

    // Get contest participation
    const contests = await db
      .collection("contest_registrations")
      .find({ userId: user.id })
      .toArray();

    const recentSubmissions = interviews.slice(0, 5);

    // Completion rate: finished sessions out of all sessions started.
    const completedInterviews = interviews.filter((i) => i.status === "completed").length;
    const acceptanceRate = interviews.length > 0 
      ? Math.round((completedInterviews / interviews.length) * 100)
      : 0;

    const userRank = (await getUserRank(user.id, db))?.rank ?? 0;

    // Get top categories (interview roles where user performed best)
    const roleScores: Record<string, { count: number; totalScore: number }> = {};
    interviews.forEach((i) => {
      const score = interviewScore100(i);
      if (score === null) return;
      const role = String(i.role || "Unknown");
      if (!roleScores[role]) {
        roleScores[role] = { count: 0, totalScore: 0 };
      }
      roleScores[role].count++;
      roleScores[role].totalScore += score;
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
        recentSubmissions: recentSubmissions.map((i) => ({
          id: i._id,
          role: i.role,
          type: i.type,
          difficulty: i.difficulty,
          status: i.status,
          score: interviewScore100(i),
          createdAt: i.createdAt,
        })),
      },
    });
  } catch (error) {
    console.error("Error fetching profile:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to fetch profile" },
      { status: 500 }
    );
  }
}
