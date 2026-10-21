import { getCurrentUser, isAdminInDb } from "@/lib/auth";
import { getDb, dbUnavailableMessage } from "@/lib/mongodb";
import { generateContestProblems } from "@/app/lib/problem-generator";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const db = await getDb();
  if (!db) return Response.json({ ok: false, error: dbUnavailableMessage() }, { status: 503 });

  if (!(await isAdminInDb(db, user.id))) {
    return Response.json({ ok: false, error: "Only admins can schedule contests" }, { status: 403 });
  }

  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });

    const name = String(body.name ?? "").trim().slice(0, 100);
    const description = typeof body.description === "string" ? body.description.slice(0, 2000) : "";
    const frequency = body.frequency === "biweekly" ? "biweekly" : "weekly";
    const dayOfWeek = Math.min(6, Math.max(0, Math.floor(Number(body.dayOfWeek ?? 5)) || 0));
    const startTime = typeof body.startTime === "string" && /^\d{2}:\d{2}$/.test(body.startTime) ? body.startTime : "00:00";
    const duration = Math.min(48, Math.max(1, Number(body.duration) || 2)); // hours
    const maxParticipants = Math.min(100_000, Math.max(1, Math.floor(Number(body.maxParticipants) || 1000)));
    const problemCount = Math.min(10, Math.max(1, Math.floor(Number(body.problemCount) || 3)));
    const startDate = body.startDate ? new Date(String(body.startDate)) : new Date();
    const endDate = body.endDate ? new Date(String(body.endDate)) : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

    if (!name) {
      return Response.json({ ok: false, error: "Missing contest name" }, { status: 400 });
    }
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate) {
      return Response.json({ ok: false, error: "Invalid startDate/endDate." }, { status: 400 });
    }

    // Each contest triggers AI problem generation; cap the batch size.
    const MAX_SCHEDULED = 60;
    const createdContests = [];
    const currentDate = new Date(startDate);
    const finalDate = new Date(endDate);
    const increment = frequency === "biweekly" ? 14 : 7; // days

    // Generate contests for the specified period
    while (currentDate <= finalDate && createdContests.length < MAX_SCHEDULED) {
      // Find next occurrence of desired day
      const daysDifference = (dayOfWeek - currentDate.getDay() + 7) % 7;
      if (daysDifference > 0) {
        currentDate.setDate(currentDate.getDate() + daysDifference);
      }

      if (currentDate > finalDate) break;

      // Set start time
      const [hours, minutes] = startTime.split(":").map(Number);
      currentDate.setHours(hours, minutes, 0, 0);

      const contestStartDate = new Date(currentDate);
      const contestEndDate = new Date(contestStartDate);
      contestEndDate.setHours(contestEndDate.getHours() + duration);

      // Generate problems
      const { problems, generatedAt } = await generateContestProblems(name, problemCount);

      // Create contest
      const result = await db.collection("contests").insertOne({
        name: `${name} - Week ${Math.floor((currentDate.getTime() - new Date(startDate).getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1}`,
        description: description || `${frequency.charAt(0).toUpperCase() + frequency.slice(1)} coding contest with ${problemCount} problems`,
        startDate: contestStartDate,
        endDate: contestEndDate,
        rules: `Complete all ${problemCount} coding problems. Score is based on correctness and efficiency.`,
        maxParticipants,
        createdBy: user.id,
        createdAt: new Date(),
        status: contestStartDate > new Date() ? "upcoming" : "ongoing",
        participantCount: 0,
        type: "coding",
        frequency,
        problems,
        problemCount: problems.length,
        generatedAt,
        isRecurring: true,
        recurringId: `${name}-${frequency}`,
      });

      createdContests.push({
        id: result.insertedId,
        startDate: contestStartDate,
        endDate: contestEndDate,
      });

      // Move to next contest
      currentDate.setDate(currentDate.getDate() + increment);
    }

    return Response.json({
      ok: true,
      message: `Created ${createdContests.length} contests`,
      contests: createdContests,
      frequency,
    });
  } catch (error) {
    console.error("Error scheduling contests:", error);
    return Response.json({ ok: false, error: "Failed to schedule contests" }, { status: 500 });
  }
}
