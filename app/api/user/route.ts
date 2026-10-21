import { getCurrentUser, isAdminInDb } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";
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

    // Reflect the current admin flag from the database, not the (possibly stale) token.
    const db = await getDb();
    const isAdmin = db ? await isAdminInDb(db, user.id) : false;

    return NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isAdmin,
      },
    });
  } catch (error) {
    console.error("Error fetching user:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to fetch user" },
      { status: 500 }
    );
  }
}
