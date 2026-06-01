import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";
import { ObjectId } from "mongodb";

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const db = await getDb();
  if (!db) return Response.json({ ok: false, error: "Database not available" }, { status: 500 });

  try {
    const { id } = await props.params;
    const url = new URL(request.url);
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
    const pageSize = 10;
    const skip = (page - 1) * pageSize;

    if (!ObjectId.isValid(id)) {
      return Response.json({ ok: false, error: "Invalid contest ID" }, { status: 400 });
    }

    // Get registrations with user info
    const registrations = await db
      .collection("contest_registrations")
      .aggregate([
        { $match: { contestId: new ObjectId(id) } },
        { $sort: { score: -1, registeredAt: 1 } },
        { $skip: skip },
        { $limit: pageSize },
        {
          $lookup: {
            from: "users",
            localField: "userId",
            foreignField: "id",
            as: "user",
          },
        },
      ])
      .toArray();

    const total = await db.collection("contest_registrations").countDocuments({
      contestId: new ObjectId(id),
    });

    // Calculate ratings
    const leaderboard = registrations
      .map((reg, index) => {
        const baseRating = 1200; // Base rating
        const scoreBonus = (reg.score || 0) * 10; // Points from score
        const performanceBonus = (index + 1) <= 10 ? (11 - (index + 1)) * 5 : 0; // Ranking bonus
        const rating = baseRating + scoreBonus + performanceBonus;

        return {
          rank: skip + index + 1,
          userId: reg.userId,
          username: reg.user?.[0]?.email?.split("@")[0] || "Anonymous",
          email: reg.user?.[0]?.email || "N/A",
          score: reg.score || 0,
          rating: Math.round(rating),
          registeredAt: reg.registeredAt,
          status: reg.status,
          globalRating: reg.user?.[0]?.rating || 1200, // Global ELO rating
          interviewsCompleted: reg.user?.[0]?.contestsCompleted || 0,
        };
      })
      .filter((item) => item.username);

    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    return Response.json({
      ok: true,
      leaderboard,
      total,
      page,
      totalPages,
      pageSize,
    });
  } catch (error) {
    console.error("Error fetching leaderboard:", error);
    return Response.json({ ok: false, error: "Failed to fetch leaderboard" }, { status: 500 });
  }
}
