import { getDb } from "@/lib/mongodb";

export interface RankingMetrics {
  interviewScore: number;          // Average interview score
  interviewCount: number;          // Number of interviews completed
  contestScore: number;            // Average contest score
  contestCount: number;            // Number of contests participated
  contestWins: number;             // First place finishes
  eloRating: number;               // Current ELO rating
  totalScore: number;              // Total combined score
  performance: "Beginner" | "Intermediate" | "Advanced" | "Expert" | "Master";
  consistency: number;             // Score consistency (0-100)
  recentActivity: number;          // Days since last activity
  overallScore: number;            // Calculated overall ranking score
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  userName: string;
  email: string;
  metrics: RankingMetrics;
  avatar?: string;
}

async function getInterviewStats(userId: string, db: any) {
  try {
    const interviews = await db
      .collection("interviews")
      .find({ userId })
      .toArray();

    if (interviews.length === 0) {
      return {
        interviewScore: 0,
        interviewCount: 0,
        consistency: 0,
        recentActivity: 999,
      };
    }

    // Use totalScore field (0-100 scale)
    const scores = interviews
      .map((i: any) => {
        // Try totalScore first, then calculate from breakdown
        if (typeof i.totalScore === 'number') return i.totalScore;
        if (i.breakdown?.technical !== undefined) {
          const breakdown = i.breakdown;
          return (breakdown.technical + breakdown.clarity + breakdown.confidence + breakdown.depth) / 4;
        }
        return 0;
      })
      .filter((s: number) => s > 0);

    if (scores.length === 0) {
      return {
        interviewScore: 0,
        interviewCount: interviews.length,
        consistency: 0,
        recentActivity: 999,
      };
    }

    const avgScore = scores.reduce((a: number, b: number) => a + b, 0) / scores.length;
    
    // Calculate consistency (lower stddev = higher consistency)
    const variance = scores.reduce((sum: number, score: number) => sum + Math.pow(score - avgScore, 2), 0) / scores.length;
    const stddev = Math.sqrt(variance);
    const consistency = Math.max(0, 100 - stddev * 2); // Convert to 0-100 scale

    // Get most recent interview
    const mostRecent = interviews.sort((a: any, b: any) => 
      new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    )[0];
    
    const recentActivity = mostRecent?.createdAt 
      ? Math.floor((Date.now() - new Date(mostRecent.createdAt).getTime()) / (24 * 60 * 60 * 1000))
      : 999;

    return {
      interviewScore: avgScore,
      interviewCount: interviews.length,
      consistency,
      recentActivity,
    };
  } catch (error) {
    console.error("Error getting interview stats:", error);
    return {
      interviewScore: 0,
      interviewCount: 0,
      consistency: 0,
      recentActivity: 999,
    };
  }
}

async function getContestStats(userId: string, db: any) {
  try {
    const registrations = await db
      .collection("contest_registrations")
      .find({ userId })
      .toArray();

    if (registrations.length === 0) {
      return {
        contestScore: 0,
        contestCount: 0,
        contestWins: 0,
      };
    }

    const scores = registrations
      .map((r: any) => r.score || 0)
      .filter((s: number) => s > 0);

    if (scores.length === 0) {
      return {
        contestScore: 0,
        contestCount: registrations.length,
        contestWins: 0,
      };
    }

    const avgScore = scores.reduce((a: number, b: number) => a + b, 0) / scores.length;

    // Count wins (top 10% in each contest)
    let wins = 0;
    for (const reg of registrations) {
      const contestId = reg.contestId;
      const totalParticipants = await db
        .collection("contest_registrations")
        .countDocuments({ contestId });
      
      const betterScores = await db
        .collection("contest_registrations")
        .countDocuments({ contestId, score: { $gt: reg.score } });
      
      if (betterScores < Math.ceil(totalParticipants * 0.1)) {
        wins++;
      }
    }

    return {
      contestScore: avgScore,
      contestCount: registrations.length,
      contestWins: wins,
    };
  } catch {
    return {
      contestScore: 0,
      contestCount: 0,
      contestWins: 0,
    };
  }
}

function getPerformanceLevel(eloRating: number): "Beginner" | "Intermediate" | "Advanced" | "Expert" | "Master" {
  if (eloRating >= 1500) return "Master";
  if (eloRating >= 1400) return "Expert";
  if (eloRating >= 1300) return "Advanced";
  if (eloRating >= 1200) return "Intermediate";
  return "Beginner";
}

function calculateOverallScore(metrics: RankingMetrics): number {
  // Weighted scoring system
  const weights = {
    interview: 0.25,      // 25% from interview performance
    contest: 0.25,        // 25% from contest performance
    elo: 0.30,            // 30% from ELO rating (normalized to 0-100)
    consistency: 0.10,    // 10% from consistency
    activity: 0.10,       // 10% from recent activity
  };

  // Normalize ELO to 0-100 (base 1200 = 60, max 2000 = 100)
  const eloNormalized = Math.min(100, Math.max(0, (metrics.eloRating - 1200) / 8));

  // Normalize activity (0 days = 100, 365+ days = 0)
  const activityScore = Math.max(0, 100 - (metrics.recentActivity * 0.27));

  const overall =
    (metrics.interviewScore / 100) * weights.interview * 100 +
    (metrics.contestScore / 100) * weights.contest * 100 +
    eloNormalized * weights.elo +
    metrics.consistency * weights.consistency +
    activityScore * weights.activity;

  return Math.round(overall);
}

export async function calculateUserMetrics(userId: string, db: any): Promise<RankingMetrics> {
  // Get interview stats
  const interviewStats = await getInterviewStats(userId, db);

  // Get contest stats
  const contestStats = await getContestStats(userId, db);

  // Get user document for ELO rating
  const user = await db.collection("users").findOne({ id: userId });
  const eloRating = user?.rating || 1200;

  // Get total score
  const totalScore = (interviewStats.interviewScore * interviewStats.interviewCount +
    contestStats.contestScore * contestStats.contestCount) /
    (interviewStats.interviewCount + contestStats.contestCount || 1);

  const metrics: RankingMetrics = {
    interviewScore: Math.round(interviewStats.interviewScore),
    interviewCount: interviewStats.interviewCount,
    contestScore: Math.round(contestStats.contestScore),
    contestCount: contestStats.contestCount,
    contestWins: contestStats.contestWins,
    eloRating,
    totalScore: Math.round(totalScore),
    performance: getPerformanceLevel(eloRating),
    consistency: Math.round(interviewStats.consistency),
    recentActivity: interviewStats.recentActivity,
    overallScore: 0, // Will be calculated
  };

  metrics.overallScore = calculateOverallScore(metrics);
  return metrics;
}

export async function getGlobalLeaderboard(
  db: any,
  page: number = 1,
  limit: number = 50
): Promise<{ entries: LeaderboardEntry[]; total: number }> {
  try {
    // Get all users
    const allUsers = await db
      .collection("users")
      .find({})
      .toArray();

    // Calculate metrics for each user
    const usersWithMetrics = await Promise.all(
      allUsers.map(async (user: any) => ({
        user,
        metrics: await calculateUserMetrics(user.id || user._id.toString(), db),
      }))
    );

    // Sort by overall score
    usersWithMetrics.sort((a, b) => b.metrics.overallScore - a.metrics.overallScore);

    // Apply pagination
    const total = usersWithMetrics.length;
    const start = (page - 1) * limit;
    const end = start + limit;
    const paginatedUsers = usersWithMetrics.slice(start, end);

    // Create leaderboard entries with ranks
    const entries: LeaderboardEntry[] = paginatedUsers.map((item, index) => ({
      rank: start + index + 1,
      userId: item.user.id || item.user._id.toString(),
      userName: item.user.name || "Anonymous",
      email: item.user.email,
      metrics: item.metrics,
    }));

    return { entries, total };
  } catch (error) {
    console.error("Error calculating global leaderboard:", error);
    return { entries: [], total: 0 };
  }
}

export async function getUserRank(userId: string, db: any): Promise<{ rank: number; total: number } | null> {
  try {
    const allUsers = await db
      .collection("users")
      .find({})
      .toArray();

    const usersWithMetrics = await Promise.all(
      allUsers.map(async (user: any) => ({
        id: user.id || user._id.toString(),
        metrics: await calculateUserMetrics(user.id || user._id.toString(), db),
      }))
    );

    usersWithMetrics.sort((a, b) => b.metrics.overallScore - a.metrics.overallScore);

    const userIndex = usersWithMetrics.findIndex((u) => u.id === userId);
    if (userIndex === -1) return null;

    return {
      rank: userIndex + 1,
      total: usersWithMetrics.length,
    };
  } catch {
    return null;
  }
}
