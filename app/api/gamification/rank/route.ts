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

    const userData = await (users.findOne as any)({ _id: userId });
    if (!userData) return NextResponse.json({ ok: false, error: "User not found." }, { status: 404 });

    // Get user rank
    const rank = await (users.countDocuments as any)({
      points: { $gt: userData.points || 0 },
    });

    return NextResponse.json({
      ok: true,
      rank: rank + 1,
      userPoints: userData.points || 0,
      usersAhead: rank,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? "Failed to fetch rank" }, { status: 500 });
  }
}
