import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  // Check if user is admin
  if (!user.isAdmin) {
    return Response.json({ ok: false, error: "Only admins can create sample contests" }, { status: 403 });
  }

  const db = await getDb();
  if (!db) return Response.json({ ok: false, error: "Database not available" }, { status: 500 });

  try {
    const body = await request.json();

    // Create sample contests for testing
    const contests = [
      {
        name: "Weekly Interview Challenge #1",
        description: "Test your interview skills in this weekly challenge. Compete with others and climb the leaderboard!",
        startDate: new Date(),
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
        rules: "• Complete 3 interview questions\n• Each question has a time limit\n• Your score is based on answer quality\n• Top 3 winners get bonus points",
        maxParticipants: 100,
        createdBy: "system",
        createdAt: new Date(),
        status: "upcoming",
        participantCount: 0,
      },
      {
        name: "Technical Interview Sprint",
        description: "Focused on technical interview questions. Perfect for backend and system design preparation.",
        startDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000), // Tomorrow
        endDate: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000), // 8 days from now
        rules: "• 5 Technical questions\n• System design focus\n• 30 minutes time limit\n• Higher difficulty level",
        maxParticipants: 50,
        createdBy: "system",
        createdAt: new Date(),
        status: "upcoming",
        participantCount: 0,
      },
      {
        name: "HR Communication Round",
        description: "Master HR interviews and soft skills. Practice common HR questions and improve your communication.",
        startDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // Started yesterday
        endDate: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000), // Ends in 6 days
        rules: "• Focus on HR and behavioral questions\n• 3 questions total\n• 20 minutes per question\n• Emphasis on clarity and confidence",
        maxParticipants: 200,
        createdBy: "system",
        createdAt: new Date(),
        status: "ongoing",
        participantCount: 5,
      },
    ];

    const result = await db.collection("contests").insertMany(contests);

    return Response.json({
      ok: true,
      message: "Sample contests created",
      ids: result.insertedIds,
    });
  } catch (error) {
    console.error("Error creating sample contests:", error);
    return Response.json({ ok: false, error: "Failed to create contests" }, { status: 500 });
  }
}
