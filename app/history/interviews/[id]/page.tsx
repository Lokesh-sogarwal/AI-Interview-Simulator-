import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";
import InterviewDetailsClient from "../InterviewDetailsClient";

export const dynamic = "force-dynamic";

type Interview = {
  _id?: string;
  userId?: string;
  createdAt?: Date;
  role?: string;
  experience?: string;
  type?: string;
  difficulty?: string;
  company?: string;
  focusAreas?: string;
  interactionMode?: "typing" | "video";
  totalScore?: number | null;
  averageScore?: number | null;
  feedback?: string;
  performance?: any;
  questions?: Array<{
    question: string;
    userAnswer: string;
    feedback?: string;
    score?: number;
  }>;
};

export default async function InterviewDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/auth/login");
  }

  const { id } = await params;
  const db = await getDb();

  if (!db) {
    return (
      <InterviewDetailsClient>
        <div className="text-foreground/70">
          Database not configured.
        </div>
      </InterviewDetailsClient>
    );
  }

  let interview: Interview | null = null;

  try {
    const { ObjectId } = await import("mongodb");
    interview = (await db
      .collection("interviews")
      .findOne({ _id: new ObjectId(id), userId: user.id })) as unknown as Interview | null;
  } catch {
    interview = null;
  }

  if (!interview) {
    return (
      <InterviewDetailsClient>
        <div className="rounded-lg border border-foreground/10 bg-foreground/[0.02] p-8 text-center text-foreground/70">
          Interview not found or access denied.
        </div>
      </InterviewDetailsClient>
    );
  }

  const score = typeof interview.totalScore === "number" 
    ? interview.totalScore 
    : typeof interview.averageScore === "number" 
      ? interview.averageScore 
      : null;

  const scorePercentage = score ? Math.min(100, Math.round((score / 10) * 100)) : 0;

  const getDifficultyColor = (difficulty?: string) => {
    switch (difficulty?.toLowerCase()) {
      case "easy":
        return "bg-green-500/10 text-green-700 border-green-500/20";
      case "medium":
        return "bg-yellow-500/10 text-yellow-700 border-yellow-500/20";
      case "hard":
        return "bg-red-500/10 text-red-700 border-red-500/20";
      default:
        return "bg-blue-500/10 text-blue-700 border-blue-500/20";
    }
  };

  const getDifficultyEmoji = (difficulty?: string) => {
    switch (difficulty?.toLowerCase()) {
      case "easy":
        return "🟢";
      case "medium":
        return "🟡";
      case "hard":
        return "🔴";
      default:
        return "🔵";
    }
  };

  return (
    <InterviewDetailsClient>
      {/* Header Section */}
      <div className="mb-8 rounded-lg border border-foreground/10 bg-foreground/[0.02] p-8">
        <div className="flex items-start justify-between gap-6">
          {/* Info */}
          <div className="flex-1">
            <h1 className="mb-2 text-3xl font-bold text-foreground">Interview Report</h1>
            <p className="text-sm text-foreground/70">
              {interview.createdAt
                ? new Date(interview.createdAt).toLocaleString("en-US", {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "Unknown date"}
            </p>

            {/* Details Grid */}
            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <div className="text-xs font-medium text-foreground/60">Type</div>
                <div className="mt-1 text-sm font-semibold text-foreground">
                  {interview.type || "—"}
                </div>
              </div>
              <div>
                <div className="text-xs font-medium text-foreground/60">Role</div>
                <div className="mt-1 text-sm font-semibold text-foreground">
                  {interview.role || "—"}
                </div>
              </div>
              <div>
                <div className="text-xs font-medium text-foreground/60">Experience</div>
                <div className="mt-1 text-sm font-semibold text-foreground">
                  {interview.experience || "—"}
                </div>
              </div>
              <div>
                <div className="text-xs font-medium text-foreground/60">Mode</div>
                <div className="mt-1 text-sm font-semibold text-foreground">
                  {interview.interactionMode === "video" ? "📹 Video" : "⌨️ Typing"}
                </div>
              </div>
            </div>
          </div>

          {/* Score Card */}
          <div className="flex flex-col items-center gap-4 rounded-lg border border-foreground/10 bg-background p-6">
            <div className="relative h-24 w-24">
              <svg
                className="absolute inset-0 h-24 w-24 -rotate-90 transform"
                viewBox="0 0 100 100"
              >
                <circle
                  cx="50"
                  cy="50"
                  r="45"
                  stroke="currentColor"
                  strokeWidth="3"
                  fill="none"
                  className="text-foreground/10"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="45"
                  stroke="currentColor"
                  strokeWidth="3"
                  fill="none"
                  strokeDasharray={`${(scorePercentage / 100) * 283} 283`}
                  className="text-blue-500 transition-all"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="text-2xl font-bold text-foreground">
                  {scorePercentage}
                </div>
                <div className="text-xs text-foreground/60">%</div>
              </div>
            </div>
            <div className="text-center">
              <div className="text-sm font-semibold text-foreground">
                {score ? `${score}/10` : "N/A"}
              </div>
              <div className="text-xs text-foreground/60">Overall Score</div>
            </div>
          </div>
        </div>
      </div>

      {/* Difficulty Badge */}
      {interview.difficulty && (
        <div className="mb-6">
          <div
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 ${getDifficultyColor(interview.difficulty)}`}
          >
            <span className="text-lg">
              {getDifficultyEmoji(interview.difficulty)}
            </span>
            <span className="text-sm font-medium">{interview.difficulty} Interview</span>
          </div>
        </div>
      )}

      {/* Key Metrics */}
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        {interview.company && (
          <div className="rounded-lg border border-foreground/10 bg-foreground/[0.02] p-4">
            <div className="text-xs font-medium text-foreground/60">Company</div>
            <div className="mt-2 text-base font-semibold text-foreground">
              {interview.company}
            </div>
          </div>
        )}
        {interview.focusAreas && (
          <div className="rounded-lg border border-foreground/10 bg-foreground/[0.02] p-4">
            <div className="text-xs font-medium text-foreground/60">Focus Areas</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {interview.focusAreas.split(",").map((area, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center rounded-full bg-foreground/10 px-2 py-1 text-xs font-medium text-foreground"
                >
                  {area.trim()}
                </span>
              ))}
            </div>
          </div>
        )}
        <div className="rounded-lg border border-foreground/10 bg-foreground/[0.02] p-4">
          <div className="text-xs font-medium text-foreground/60">Duration</div>
          <div className="mt-2 text-base font-semibold text-foreground">~20 mins</div>
        </div>
      </div>

      {/* Feedback Section */}
      {interview.feedback && (
        <div className="mb-8 rounded-lg border border-foreground/10 bg-foreground/[0.02] p-6">
          <h2 className="mb-4 text-lg font-semibold text-foreground">Feedback</h2>
          <div className="space-y-4 text-sm text-foreground/80 leading-relaxed">
            {interview.feedback.split("\n").map((line, idx) => (
              line.trim() && <p key={idx}>{line}</p>
            ))}
          </div>
        </div>
      )}

      {/* Questions Section */}
      {interview.questions && interview.questions.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-4 text-lg font-semibold text-foreground">
            Questions & Answers
          </h2>
          <div className="space-y-4">
            {interview.questions.map((qa, idx) => (
              <div
                key={idx}
                className="rounded-lg border border-foreground/10 bg-foreground/[0.02] p-6"
              >
                <div className="mb-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-xs font-semibold text-foreground/60">
                        Question {idx + 1}
                      </div>
                      <h3 className="mt-2 text-base font-semibold text-foreground">
                        {qa.question}
                      </h3>
                    </div>
                    {qa.score !== undefined && (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/10 text-sm font-bold text-blue-700">
                        {qa.score}
                      </div>
                    )}
                  </div>
                </div>

                <div className="mb-4 border-t border-foreground/10 pt-4">
                  <div className="text-xs font-medium text-foreground/60">Your Answer</div>
                  <p className="mt-2 text-sm text-foreground/80">
                    {qa.userAnswer || "No answer provided"}
                  </p>
                </div>

                {qa.feedback && (
                  <div className="border-t border-foreground/10 pt-4">
                    <div className="text-xs font-medium text-foreground/60">Feedback</div>
                    <p className="mt-2 text-sm text-foreground/80">{qa.feedback}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Performance Metrics */}
      {interview.performance && (
        <div className="mb-8">
          <h2 className="mb-4 text-lg font-semibold text-foreground">
            Performance Breakdown
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {Object.entries(interview.performance).map(([key, value]) => (
              <div
                key={key}
                className="rounded-lg border border-foreground/10 bg-foreground/[0.02] p-4"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-medium text-foreground/60 capitalize">
                      {key.replace(/_/g, " ")}
                    </div>
                    <div className="mt-2 text-lg font-bold text-foreground">
                      {typeof value === "number" ? `${value}%` : String(value)}
                    </div>
                  </div>
                  <div className="h-12 w-12 rounded-lg bg-foreground/5" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3 pt-8">
        <a
          href="/history"
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-foreground/15 bg-background px-6 py-3 text-sm font-medium transition-all hover:border-foreground/30 hover:bg-foreground/5"
        >
          ← Back
        </a>
        <a
          href="/interview/setup"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white transition-all hover:bg-blue-700"
        >
          Take Another Interview
        </a>
      </div>
    </InterviewDetailsClient>
  );
}
