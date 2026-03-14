import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";
import SignOutButton from "./SignOutButton";
import StartScheduledButton from "./StartScheduledButton";

export const dynamic = "force-dynamic";

type InterviewItem = {
  _id?: string;
  createdAt?: Date;
  scheduledFor?: Date;
  role?: string;
  experience?: string;
  type?: string;
  difficulty?: string;
  company?: string;
  focusAreas?: string;
  interactionMode?: "typing" | "video";
  useResume?: boolean;
  resumeText?: string | null;
  totalScore?: number | null;
  averageScore?: number | null;
  status?: string;
};

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/auth/login");
  }

  const db = await getDb();
  const scheduled: InterviewItem[] = db
    ? ((await db
        .collection("interviews")
        .find({ userId: user.id, status: "scheduled" })
        .sort({ scheduledFor: 1 })
        .limit(20)
        .toArray()) as unknown as InterviewItem[])
    : [];

  const interviews: InterviewItem[] = db
    ? ((await db
        .collection("interviews")
        .find({ userId: user.id, status: { $ne: "scheduled" } })
        .sort({ createdAt: -1 })
        .limit(20)
        .toArray()) as unknown as InterviewItem[])
    : [];

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <div className="font-semibold">Interview Simulator</div>
        <SignOutButton />
      </header>

      <main className="mx-auto w-full max-w-6xl px-6 pb-16">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="mt-2 text-sm text-foreground/70">Your interviews</p>

        {db && scheduled.length > 0 ? (
          <div className="mt-8 rounded-2xl border border-foreground/10 bg-foreground/[0.03] p-6">
            <div className="text-sm font-medium">Scheduled</div>
            <div className="mt-1 text-sm text-foreground/70">Start an upcoming interview</div>

            <div className="mt-4 overflow-hidden rounded-xl border border-foreground/10 bg-background">
              <table className="w-full text-left text-sm">
                <thead className="bg-foreground/[0.03] text-foreground/80">
                  <tr>
                    <th className="px-4 py-3 font-medium">Scheduled for</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">Role</th>
                    <th className="px-4 py-3 font-medium">Difficulty</th>
                    <th className="px-4 py-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {scheduled.map((it) => (
                    <tr key={String(it._id)} className="border-t border-foreground/10">
                      <td className="px-4 py-3 text-foreground/80">
                        {it.scheduledFor ? new Date(it.scheduledFor).toLocaleString() : "—"}
                      </td>
                      <td className="px-4 py-3">{it.type || "—"}</td>
                      <td className="px-4 py-3">{it.role || "—"}</td>
                      <td className="px-4 py-3">{it.difficulty || "—"}</td>
                      <td className="px-4 py-3 text-right">
                        {it._id ? (
                          <StartScheduledButton
                            details={{
                              id: String(it._id),
                              type: String(it.type || "HR"),
                              role: String(it.role || "Software Engineer"),
                              experience: String(it.experience || "0-2 years"),
                              difficulty: String(it.difficulty || "Adaptive"),
                              company: String(it.company || ""),
                              focusAreas: String(it.focusAreas || ""),
                              interactionMode: it.interactionMode === "video" ? "video" : "typing",
                              useResume: it.useResume !== false,
                              resumeText: it.resumeText ?? null,
                            }}
                          />
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        <div className="mt-8 rounded-2xl border border-foreground/10 bg-foreground/[0.03] p-6">
          {!db ? (
            <div className="text-sm text-foreground/70">
              Database not configured. Set <span className="font-medium">MONGODB_URI</span> to enable interview history.
            </div>
          ) : interviews.length > 0 ? (
            <>
              <div className="text-sm font-medium">Recent</div>
              <div className="mt-1 text-sm text-foreground/70">Completed or in-progress interviews</div>
              <div className="mt-4 overflow-hidden rounded-xl border border-foreground/10 bg-background">
              <table className="w-full text-left text-sm">
                <thead className="bg-foreground/[0.03] text-foreground/80">
                  <tr>
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">Role</th>
                    <th className="px-4 py-3 font-medium">Difficulty</th>
                    <th className="px-4 py-3 font-medium">Score</th>
                    <th className="px-4 py-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {interviews.map((it) => (
                    <tr key={String(it._id)} className="border-t border-foreground/10">
                      <td className="px-4 py-3 text-foreground/80">
                        {it._id ? (
                          <a
                            href={`/dashboard/interviews/${String(it._id)}`}
                            className="underline underline-offset-4 hover:opacity-90"
                          >
                            {it.createdAt ? new Date(it.createdAt).toLocaleString() : "—"}
                          </a>
                        ) : (
                          it.createdAt ? new Date(it.createdAt).toLocaleString() : "—"
                        )}
                      </td>
                      <td className="px-4 py-3">{it.type || "—"}</td>
                      <td className="px-4 py-3">{it.role || "—"}</td>
                      <td className="px-4 py-3">{it.difficulty || "—"}</td>
                      <td className="px-4 py-3">
                        {typeof it.totalScore === "number"
                          ? it.totalScore
                          : typeof it.averageScore === "number"
                            ? `${it.averageScore}/10`
                            : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {it._id ? (
                          <a
                            href={`/dashboard/interviews/${String(it._id)}`}
                            className="inline-flex h-9 items-center justify-center rounded-full border border-foreground/15 px-4 text-sm font-medium transition-opacity hover:opacity-90"
                          >
                            View report
                          </a>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </>
          ) : (
            <div className="text-sm text-foreground/70">No interviews saved yet.</div>
          )
          }
        </div>
      </main>
    </div>
  );
}
