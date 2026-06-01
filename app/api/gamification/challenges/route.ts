import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { ObjectId } from "mongodb";

interface Challenge {
  id: string;
  title: string;
  description: string;
  reward: number;
  icon: string;
}

const DAILY_CHALLENGES: Challenge[] = [
  {
    id: "first_interview",
    title: "Complete Your First Interview",
    description: "Start and finish an interview session",
    reward: 50,
    icon: "🎯",
  },
  {
    id: "resume_save",
    title: "Save a Resume",
    description: "Upload and save your resume with ATS analysis",
    reward: 15,
    icon: "💾",
  },
  {
    id: "improve_score",
    title: "Score 80+",
    description: "Get an interview score of 80 or higher",
    reward: 75,
    icon: "⭐",
  },
  {
    id: "streak_3",
    title: "3-Day Streak",
    description: "Practice for 3 consecutive days",
    reward: 100,
    icon: "🔥",
  },
];

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });

    const db = await getDb();
    if (!db) return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });

    const users = db.collection("users");
    const userId = ObjectId.isValid(user.id) ? new ObjectId(user.id) : user.id;

    const userData = await (users.findOne as any)({ _id: userId });
    if (!userData) return NextResponse.json({ ok: false, error: "User not found." }, { status: 404 });

    const completedChallenges = userData.completedChallenges || [];
    const today = new Date().toDateString();

    const challenges = DAILY_CHALLENGES.map((challenge) => ({
      ...challenge,
      completed: completedChallenges.some(
        (c: any) => c.id === challenge.id && new Date(c.completedAt).toDateString() === today
      ),
    }));

    return NextResponse.json({
      ok: true,
      challenges,
      totalRewardToday: challenges
        .filter((c) => c.completed)
        .reduce((sum, c) => sum + c.reward, 0),
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Failed to fetch challenges" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });

    const body = (await request.json().catch(() => null)) as { challengeId?: string } | null;

    if (!body || !body.challengeId) {
      return NextResponse.json({ ok: false, error: "Missing challengeId." }, { status: 400 });
    }

    const challenge = DAILY_CHALLENGES.find((c) => c.id === body.challengeId);
    if (!challenge) {
      return NextResponse.json({ ok: false, error: "Challenge not found." }, { status: 404 });
    }

    const db = await getDb();
    if (!db) return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });

    const users = db.collection("users");
    const userId = ObjectId.isValid(user.id) ? new ObjectId(user.id) : user.id;

    // Check if already completed today
    const userData = await (users.findOne as any)({ _id: userId });
    const today = new Date().toDateString();
    const alreadyCompleted = (userData?.completedChallenges || []).some(
      (c: any) => c.id === body.challengeId && new Date(c.completedAt).toDateString() === today
    );

    if (alreadyCompleted) {
      return NextResponse.json(
        { ok: false, error: "Challenge already completed today." },
        { status: 400 }
      );
    }

    // Award points and mark challenge as completed
    await (users.updateOne as any)(
      { _id: userId },
      {
        $inc: { points: challenge.reward },
        $push: {
          completedChallenges: {
            id: body.challengeId,
            completedAt: new Date(),
          },
        },
      }
    );

    return NextResponse.json({
      ok: true,
      message: `Challenge completed! +${challenge.reward} points`,
      reward: challenge.reward,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Failed to complete challenge" },
      { status: 500 }
    );
  }
}
