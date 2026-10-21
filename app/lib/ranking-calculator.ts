import type { Db, Document } from "mongodb";

import { displayName } from "@/lib/contests";

export interface RankingMetrics {
  interviewScore: number;          // Average completed-interview score (0-100)
  interviewCount: number;          // Number of interviews completed
  contestScore: number;            // Average contest score (0-100)
  contestCount: number;            // Number of contests participated
  contestWins: number;             // Top-10% finishes
  eloRating: number;               // Contest rating (see contestRating)
  totalScore: number;              // Sum of contest scores
  performance: "Beginner" | "Intermediate" | "Advanced" | "Expert" | "Master";
  consistency: number;             // Interview score consistency (0-100)
  recentActivity: number;          // Days since last completed interview
  overallScore: number;            // Calculated overall ranking score
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  userName: string;
  metrics: RankingMetrics;
  avatar?: string;
}

const BASE_RATING = 1200;
const MAX_USERS = 10_000;

/**
 * Interview score on a 0-100 scale. Live interviews store `averageScore` (0-10);
 * legacy documents stored `totalScore` (0-100).
 */
export function interviewScore100(doc: Document): number | null {
  if (typeof doc.averageScore === "number" && Number.isFinite(doc.averageScore)) return doc.averageScore * 10;
  if (typeof doc.totalScore === "number" && Number.isFinite(doc.totalScore) && doc.totalScore > 0) return doc.totalScore;
  return null;
}

/** Rating = 1200 + half of every contest score (a perfect contest adds 50) + 10 per top-10% finish. */
export function contestRating(contestScores: number[], wins: number) {
  return Math.round(BASE_RATING + contestScores.reduce((a, b) => a + b, 0) / 2 + wins * 10);
}

function getPerformanceLevel(eloRating: number): RankingMetrics["performance"] {
  if (eloRating >= 1500) return "Master";
  if (eloRating >= 1400) return "Expert";
  if (eloRating >= 1300) return "Advanced";
  if (eloRating >= 1200) return "Intermediate";
  return "Beginner";
}

function calculateOverallScore(metrics: RankingMetrics): number {
  const weights = { interview: 0.25, contest: 0.25, elo: 0.3, consistency: 0.1, activity: 0.1 };
  // Normalize rating to 0-100 (1200 = 0, 2000+ = 100).
  const eloNormalized = Math.min(100, Math.max(0, (metrics.eloRating - BASE_RATING) / 8));
  // Activity: today = 100, a year or more ago = 0; never active = 0.
  const activityScore = metrics.interviewCount === 0 ? 0 : Math.max(0, 100 - metrics.recentActivity * 0.27);

  return Math.round(
    metrics.interviewScore * weights.interview +
      metrics.contestScore * weights.contest +
      eloNormalized * weights.elo +
      metrics.consistency * weights.consistency +
      activityScore * weights.activity,
  );
}

type InterviewAgg = { scores: number[]; count: number; lastAt: Date | null };
type ContestAgg = { scores: number[]; count: number; wins: number };

export function buildMetrics(interviews: InterviewAgg | undefined, contests: ContestAgg | undefined, now = Date.now()): RankingMetrics {
  const iScores = interviews?.scores ?? [];
  const avgInterview = iScores.length ? iScores.reduce((a, b) => a + b, 0) / iScores.length : 0;
  const variance = iScores.length ? iScores.reduce((s, x) => s + (x - avgInterview) ** 2, 0) / iScores.length : 0;
  const consistency = iScores.length ? Math.max(0, 100 - Math.sqrt(variance) * 2) : 0;
  const recentActivity = interviews?.lastAt ? Math.floor((now - interviews.lastAt.getTime()) / 86_400_000) : 999;

  const cScores = contests?.scores ?? [];
  const avgContest = cScores.length ? cScores.reduce((a, b) => a + b, 0) / cScores.length : 0;
  const wins = contests?.wins ?? 0;
  const eloRating = contestRating(cScores, wins);

  const metrics: RankingMetrics = {
    interviewScore: Math.round(avgInterview),
    interviewCount: interviews?.count ?? 0,
    contestScore: Math.round(avgContest),
    contestCount: contests?.count ?? 0,
    contestWins: wins,
    eloRating,
    totalScore: Math.round(cScores.reduce((a, b) => a + b, 0)),
    performance: getPerformanceLevel(eloRating),
    consistency: Math.round(consistency),
    recentActivity,
    overallScore: 0,
  };
  metrics.overallScore = calculateOverallScore(metrics);
  return metrics;
}

async function aggregateInterviews(db: Db, userId?: string) {
  const docs = await db
    .collection("interviews")
    .find(
      { status: "completed", ...(userId ? { userId } : { userId: { $type: "string" } }) },
      { projection: { userId: 1, averageScore: 1, totalScore: 1, completedAt: 1, createdAt: 1 } },
    )
    .limit(200_000)
    .toArray();
  const byUser = new Map<string, InterviewAgg>();
  for (const d of docs) {
    const key = String(d.userId);
    const agg = byUser.get(key) ?? { scores: [], count: 0, lastAt: null };
    agg.count += 1;
    const s = interviewScore100(d);
    if (s !== null) agg.scores.push(s);
    const at = new Date(d.completedAt ?? d.createdAt ?? 0);
    if (!agg.lastAt || at > agg.lastAt) agg.lastAt = at;
    byUser.set(key, agg);
  }
  return byUser;
}

async function aggregateContests(db: Db, userId?: string) {
  const regs = userId
    ? await db.collection("contest_registrations").find({ userId }, { projection: { contestId: 1, userId: 1, score: 1 } }).toArray()
    : await db.collection("contest_registrations").find({}, { projection: { contestId: 1, userId: 1, score: 1 } }).limit(200_000).toArray();

  // Ranking within each contest needs every registration for those contests.
  const all = userId
    ? await db
        .collection("contest_registrations")
        .find({ contestId: { $in: regs.map((r) => r.contestId) } }, { projection: { contestId: 1, score: 1 } })
        .toArray()
    : regs;
  const scoresByContest = new Map<string, number[]>();
  for (const r of all) {
    const key = String(r.contestId);
    const list = scoresByContest.get(key) ?? [];
    list.push(Number(r.score) || 0);
    scoresByContest.set(key, list);
  }

  const byUser = new Map<string, ContestAgg>();
  for (const r of regs) {
    const key = String(r.userId);
    const agg = byUser.get(key) ?? { scores: [], count: 0, wins: 0 };
    const score = Number(r.score) || 0;
    agg.count += 1;
    agg.scores.push(score);
    const others = scoresByContest.get(String(r.contestId)) ?? [];
    const better = others.filter((s) => s > score).length;
    if (score > 0 && better < Math.ceil(others.length * 0.1)) agg.wins += 1;
    byUser.set(key, agg);
  }
  return byUser;
}

export async function calculateUserMetrics(userId: string, db: Db): Promise<RankingMetrics> {
  const [interviews, contests] = await Promise.all([aggregateInterviews(db, userId), aggregateContests(db, userId)]);
  return buildMetrics(interviews.get(userId), contests.get(userId));
}

async function rankAllUsers(db: Db) {
  const [users, interviews, contests] = await Promise.all([
    db.collection("users").find({}, { projection: { name: 1, email: 1 } }).limit(MAX_USERS).toArray(),
    aggregateInterviews(db),
    aggregateContests(db),
  ]);
  const ranked = users.map((u) => {
    const id = u._id.toString();
    return { id, user: u, metrics: buildMetrics(interviews.get(id), contests.get(id)) };
  });
  ranked.sort((a, b) => b.metrics.overallScore - a.metrics.overallScore || b.metrics.interviewCount - a.metrics.interviewCount);
  return ranked;
}

export async function getGlobalLeaderboard(
  db: Db,
  page: number = 1,
  limit: number = 50,
): Promise<{ entries: LeaderboardEntry[]; total: number }> {
  try {
    const ranked = await rankAllUsers(db);
    const start = (page - 1) * limit;
    const entries: LeaderboardEntry[] = ranked.slice(start, start + limit).map((item, index) => ({
      rank: start + index + 1,
      userId: item.id,
      // Public leaderboards never include email addresses.
      userName: displayName(item.user),
      metrics: item.metrics,
    }));
    return { entries, total: ranked.length };
  } catch (error) {
    console.error("Error calculating global leaderboard:", error);
    return { entries: [], total: 0 };
  }
}

export async function getUserRank(userId: string, db: Db): Promise<{ rank: number; total: number } | null> {
  try {
    const ranked = await rankAllUsers(db);
    const index = ranked.findIndex((u) => u.id === userId);
    return index === -1 ? null : { rank: index + 1, total: ranked.length };
  } catch {
    return null;
  }
}

/** Rank by contest rating (used by the ratings page). */
export async function getRatingRank(userId: string, db: Db) {
  const ranked = await rankAllUsers(db);
  ranked.sort((a, b) => b.metrics.eloRating - a.metrics.eloRating);
  const index = ranked.findIndex((u) => u.id === userId);
  return index === -1 ? null : { rank: index + 1, total: ranked.length };
}
