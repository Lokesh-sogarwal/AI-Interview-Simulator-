import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";
import SignOutButton from "../dashboard/SignOutButton";
import StartScheduledButton from "../dashboard/StartScheduledButton";
import HistoryHeader from "./HistoryHeader";

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

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const params = await searchParams;
  const user = await getCurrentUser();
  if (!user) {
    redirect("/auth/login");
  }

  const db = await getDb();

  const page = Math.max(1, Number(params?.page ?? 1));
  const pageSize = 10;
  const skip = (page - 1) * pageSize;

  const scheduled: InterviewItem[] = db
    ? ((await db
        .collection("interviews")
        .find({ userId: user.id, status: "scheduled" })
        .sort({ scheduledFor: 1 })
        .limit(20)
        .toArray()) as unknown as InterviewItem[])
    : [];

  const total = db
    ? await db.collection("interviews").countDocuments({ userId: user.id, status: { $ne: "scheduled" } })
    : 0;

  const interviews: InterviewItem[] = db
    ? ((await db
        .collection("interviews")
        .find({ userId: user.id, status: { $ne: "scheduled" } })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .toArray()) as unknown as InterviewItem[])
    : [];

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <HistoryHeader>
      <h1 className="text-2xl font-semibold">History</h1>
      <p className="mt-2 text-sm text-foreground/70">Your interview history</p>

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
                              href={`/history/interviews/${String(it._id)}`}
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
                              href={`/history/interviews/${String(it._id)}`}
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

              <div className="mt-4 flex items-center justify-between">
                <div className="text-sm text-foreground/70">Page {page} of {totalPages}</div>
                <div className="flex gap-2">
                  <a
                    href={`?page=${Math.max(1, page - 1)}`}
                    className={`inline-flex h-9 items-center justify-center rounded-full border border-foreground/10 px-3 text-sm ${page <= 1 ? 'opacity-50 pointer-events-none' : ''}`}
                  >
                    Previous
                  </a>
                  <a
                    href={`?page=${Math.min(totalPages, page + 1)}`}
                    className={`inline-flex h-9 items-center justify-center rounded-full border border-foreground/10 px-3 text-sm ${page >= totalPages ? 'opacity-50 pointer-events-none' : ''}`}
                  >
                    Next
                  </a>
                </div>
              </div>
            </>
          ) : (
            <div className="text-sm text-foreground/70">No interviews saved yet.</div>
          )}
        </div>
    </HistoryHeader>
  );
}
