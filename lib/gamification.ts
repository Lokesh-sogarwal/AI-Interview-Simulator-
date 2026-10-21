import { ObjectId, type Db } from "mongodb";

export const POINTS_PER_INTERVIEW = 50;
export const HIGH_SCORE_BONUS = 25;
/** Interview averages are stored on a 0-10 scale; "80+" means 8.0/10. */
export const HIGH_SCORE_THRESHOLD = 8;

export type DailyChallenge = { id: string; title: string; description: string; reward: number; icon: string };

export const DAILY_CHALLENGES: DailyChallenge[] = [
  { id: "first_interview", title: "Complete an interview", description: "Finish an interview session today", reward: 50, icon: "target" },
  { id: "resume_save", title: "Use your resume", description: "Complete a resume-based interview today", reward: 15, icon: "file" },
  { id: "improve_score", title: "Score 8/10 or higher", description: "Get an average interview score of 8.0+ today", reward: 75, icon: "star" },
  { id: "streak_3", title: "3-day streak", description: "Complete interviews on 3 consecutive days", reward: 100, icon: "flame" },
];

function dayKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** Number of consecutive days, ending today or yesterday, with at least one completed interview. */
export function computeStreak(completedDates: Date[], now = new Date()) {
  const days = new Set(completedDates.map(dayKey));
  const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (!days.has(dayKey(cursor))) cursor.setUTCDate(cursor.getUTCDate() - 1);
  let streak = 0;
  while (days.has(dayKey(cursor))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

type CompletedInterview = { completedAt?: Date; createdAt?: Date; averageScore?: number | null; useResume?: boolean };

/** Which daily challenges the user has genuinely met today, from stored interviews. */
export function evaluateChallenges(interviews: CompletedInterview[], now = new Date()) {
  const today = dayKey(now);
  const todays = interviews.filter((i) => dayKey(new Date(i.completedAt ?? i.createdAt ?? 0)) === today);
  const streak = computeStreak(interviews.map((i) => new Date(i.completedAt ?? i.createdAt ?? 0)), now);
  return {
    first_interview: todays.length > 0,
    resume_save: todays.some((i) => i.useResume === true),
    improve_score: todays.some((i) => typeof i.averageScore === "number" && i.averageScore >= HIGH_SCORE_THRESHOLD),
    streak_3: streak >= 3,
  } as Record<string, boolean>;
}

export async function loadCompletedInterviews(db: Db, userId: string) {
  return (await db
    .collection("interviews")
    .find({ userId, status: "completed" }, { projection: { completedAt: 1, createdAt: 1, averageScore: 1, useResume: 1 } })
    .sort({ completedAt: -1 })
    .limit(1000)
    .toArray()) as CompletedInterview[];
}

/**
 * Gamification stats derived from real, server-recorded activity: completed
 * interviews and challenges claimed after server-side verification.
 */
export async function computeGamificationStats(db: Db, userId: string) {
  const interviews = await loadCompletedInterviews(db, userId);
  const userDoc = ObjectId.isValid(userId)
    ? await db.collection("users").findOne({ _id: new ObjectId(userId) }, { projection: { completedChallenges: 1 } })
    : null;
  const claimed = Array.isArray(userDoc?.completedChallenges) ? (userDoc.completedChallenges as Array<{ id: string }>) : [];
  const challengePoints = claimed.reduce((sum, c) => sum + (DAILY_CHALLENGES.find((d) => d.id === c.id)?.reward ?? 0), 0);

  const scores = interviews.map((i) => i.averageScore).filter((n): n is number => typeof n === "number");
  const interviewPoints = interviews.reduce(
    (sum, i) => sum + POINTS_PER_INTERVIEW + (typeof i.averageScore === "number" && i.averageScore >= HIGH_SCORE_THRESHOLD ? HIGH_SCORE_BONUS : 0),
    0,
  );
  const points = interviewPoints + challengePoints;
  const totalInterviews = interviews.length;

  const badges: string[] = [];
  if (totalInterviews >= 1) badges.push("First Interview");
  if (points >= 100) badges.push("Century");
  if (totalInterviews >= 10) badges.push("Ten Times");
  if (points >= 500) badges.push("Master");

  return {
    points,
    level: Math.floor(points / 200) + 1,
    streak: computeStreak(interviews.map((i) => new Date(i.completedAt ?? i.createdAt ?? 0))),
    badges,
    totalInterviews,
    bestScore: scores.length ? Math.max(...scores) : 0,
  };
}
