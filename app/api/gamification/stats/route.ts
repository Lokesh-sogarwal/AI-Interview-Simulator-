import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { ObjectId } from "mongodb";

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });

    const db = await getDb();
    if (!db) return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });

    const users = db.collection("users");
    const userId = ObjectId.isValid(user.id) ? new ObjectId(user.id) : user.id;

    const userData = await users.findOne(
      { _id: userId } as any,
      {
        projection: {
          points: 1,
          streak: 1,
          level: 1,
          badges: 1,
          totalInterviews: 1,
          bestScore: 1,
        },
      }
    );

    if (!userData) return NextResponse.json({ ok: false, error: "User not found." }, { status: 404 });

    return NextResponse.json({
      ok: true,
      points: userData.points || 0,
      streak: userData.streak || 0,
      level: userData.level || 1,
      badges: userData.badges || [],
      totalInterviews: userData.totalInterviews || 0,
      bestScore: userData.bestScore || 0,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? "Failed to fetch stats" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });

    const body = (await request.json().catch(() => null)) as
      | { action: string; points?: number; interviewScore?: number }
      | null;

    if (!body || !body.action) {
      return NextResponse.json({ ok: false, error: "Missing action." }, { status: 400 });
    }

    const db = await getDb();
    if (!db) return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });

    const users = db.collection("users");
    const userId = ObjectId.isValid(user.id) ? new ObjectId(user.id) : user.id;

    let pointsAwarded = 0;
    let newBadges: string[] = [];

    // Award points based on action
    if (body.action === "completed_interview") {
      pointsAwarded = 50;
      if (body.interviewScore && body.interviewScore >= 80) pointsAwarded += 25;
    } else if (body.action === "saved_resume") {
      pointsAwarded = 15;
    } else if (body.action === "improved_ats") {
      pointsAwarded = 30;
    }

    // Update user document
    const result = await (users.findOneAndUpdate as any)(
      { _id: userId },
      {
        $inc: {
          points: pointsAwarded,
          totalInterviews: body.action === "completed_interview" ? 1 : 0,
          streak: 1,
        },
        $set: {
          lastActivityAt: new Date(),
        },
      },
      { returnDocument: "after" }
    );

    const updatedUser = result?.value;
    if (!updatedUser) return NextResponse.json({ ok: false, error: "Failed to update user." }, { status: 500 });

    // Calculate level based on points
    const newPoints = (updatedUser.points || 0) + pointsAwarded;
    const newLevel = Math.floor(newPoints / 200) + 1;

    // Check for new badges
    const currentBadges = updatedUser.badges || [];
    if (newPoints >= 100 && !currentBadges.includes("Century")) newBadges.push("Century");
    if (newPoints >= 500 && !currentBadges.includes("Master")) newBadges.push("Master");
    if ((updatedUser.totalInterviews || 0) === 1 && !currentBadges.includes("First Interview"))
      newBadges.push("First Interview");
    if ((updatedUser.totalInterviews || 0) >= 10 && !currentBadges.includes("Ten Times"))
      newBadges.push("Ten Times");

    if (newBadges.length > 0) {
      await (users.updateOne as any)({ _id: userId }, { $addToSet: { badges: { $each: newBadges } } });
    }

    return NextResponse.json({
      ok: true,
      pointsAwarded,
      totalPoints: newPoints,
      newBadges,
      level: newLevel,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? "Failed to update stats" }, { status: 500 });
  }
}
