import { NextResponse } from "next/server";
import { getDb, dbUnavailableMessage } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { ObjectId } from "mongodb";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });

    const db = await getDb();
    if (!db) return NextResponse.json({ ok: false, error: dbUnavailableMessage() }, { status: 503 });

    const users = db.collection("users");
    const userId = ObjectId.isValid(user.id) ? new ObjectId(user.id) : user.id;

    const userData = await users.findOne({ _id: userId as ObjectId });
    if (!userData) return NextResponse.json({ ok: false, error: "User not found." }, { status: 404 });

    // Get user rank
    const rank = await users.countDocuments({
      points: { $gt: userData.points || 0 },
    });

    return NextResponse.json({
      ok: true,
      rank: rank + 1,
      userPoints: userData.points || 0,
      usersAhead: rank,
    });
  } catch (err) {
    console.error("[api]", err);
    return NextResponse.json({ ok: false, error: "Failed to fetch rank" }, { status: 500 });
  }
}
