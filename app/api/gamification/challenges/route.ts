import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb, dbUnavailableMessage } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { readJsonObject } from "@/lib/http";
import { DAILY_CHALLENGES, evaluateChallenges, loadCompletedInterviews } from "@/lib/gamification";

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

async function loadState(userId: string) {
  const db = await getDb();
  if (!db) return null;
  const users = db.collection("users");
  const userDoc = await users.findOne({ _id: new ObjectId(userId) }, { projection: { completedChallenges: 1 } });
  const claimed = Array.isArray(userDoc?.completedChallenges)
    ? (userDoc.completedChallenges as Array<{ id: string; completedAt: Date }>)
    : [];
  const eligible = evaluateChallenges(await loadCompletedInterviews(db, userId));
  const claimedToday = new Set(
    claimed.filter((c) => new Date(c.completedAt).toISOString().slice(0, 10) === todayKey()).map((c) => c.id),
  );
  return { users, eligible, claimedToday };
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    if (!ObjectId.isValid(user.id)) return NextResponse.json({ ok: false, error: "User not found." }, { status: 404 });

    const state = await loadState(user.id);
    if (!state) return NextResponse.json({ ok: false, error: dbUnavailableMessage() }, { status: 503 });

    const challenges = DAILY_CHALLENGES.map((challenge) => ({
      ...challenge,
      completed: state.claimedToday.has(challenge.id),
      eligible: Boolean(state.eligible[challenge.id]),
    }));

    return NextResponse.json({
      ok: true,
      challenges,
      totalRewardToday: challenges.filter((c) => c.completed).reduce((sum, c) => sum + c.reward, 0),
    });
  } catch (err) {
    console.error("[gamification/challenges]", err);
    return NextResponse.json({ ok: false, error: "Failed to fetch challenges" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    if (!ObjectId.isValid(user.id)) return NextResponse.json({ ok: false, error: "User not found." }, { status: 404 });

    const body = await readJsonObject<{ challengeId: string }>(request);
    const challenge = DAILY_CHALLENGES.find((c) => c.id === body?.challengeId);
    if (!body?.challengeId) return NextResponse.json({ ok: false, error: "Missing challengeId." }, { status: 400 });
    if (!challenge) return NextResponse.json({ ok: false, error: "Challenge not found." }, { status: 404 });

    const state = await loadState(user.id);
    if (!state) return NextResponse.json({ ok: false, error: dbUnavailableMessage() }, { status: 503 });

    if (state.claimedToday.has(challenge.id)) {
      return NextResponse.json({ ok: false, error: "Challenge already completed today." }, { status: 409 });
    }
    // Rewards are only granted when the user's recorded activity meets the challenge.
    if (!state.eligible[challenge.id]) {
      return NextResponse.json({ ok: false, error: "You haven't met this challenge's requirement yet." }, { status: 400 });
    }

    // Guard against a concurrent double claim for the same day.
    const startOfDay = new Date(`${todayKey()}T00:00:00.000Z`);
    const result = await state.users.updateOne(
      { _id: new ObjectId(user.id), completedChallenges: { $not: { $elemMatch: { id: challenge.id, completedAt: { $gte: startOfDay } } } } },
      { $push: { completedChallenges: { id: challenge.id, completedAt: new Date() } } } as never,
    );
    if (result.modifiedCount === 0) {
      return NextResponse.json({ ok: false, error: "Challenge already completed today." }, { status: 409 });
    }

    return NextResponse.json({ ok: true, message: `Challenge completed! +${challenge.reward} points`, reward: challenge.reward });
  } catch (err) {
    console.error("[gamification/challenges]", err);
    return NextResponse.json({ ok: false, error: "Failed to complete challenge" }, { status: 500 });
  }
}
