"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PageHeader from "../components/PageHeader";

interface Contest {
  _id: string;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  isRegistered: boolean;
  participantCount: number;
  maxParticipants: number;
  type?: "coding" | "general";
  frequency?: "weekly" | "biweekly";
  problemCount?: number;
  problems?: Array<{ title: string; difficulty: string }>;
}

export default function ContestsPage() {
  const router = useRouter();
  const [contests, setContests] = useState<Contest[]>([]);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchContests = async () => {
      try {
        const res = await fetch("/api/contests");
        const data = await res.json();
        if (data.ok) {
          setContests(data.contests);
        } else {
          setError(data.error || "Failed to load contests");
        }
      } catch (err) {
        setError("Failed to load contests");
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchContests();
  }, []);

  const handleRegister = async (contestId: string) => {
    setRegistering(contestId);
    try {
      const res = await fetch(`/api/contests/${contestId}/register`, { method: "POST" });
      const data = await res.json();

      if (data.ok) {
        setContests(
          contests.map((c) => (c._id === contestId ? { ...c, isRegistered: true, participantCount: c.participantCount + 1 } : c)),
        );
        setError(null);
      } else {
        setError(data.error || "Failed to register");
      }
    } catch (err) {
      setError("Failed to register for contest");
      console.error(err);
    } finally {
      setRegistering(null);
    }
  };

  const getContestStatus = (startDate: string, endDate: string, isRegistered: boolean) => {
    const now = new Date();
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (now < start) return "Upcoming";
    if (now > end) return "Ended";
    if (isRegistered) return "Active";
    return "Ongoing";
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground p-6">
        <div className="mx-auto max-w-6xl">
          <p className="text-center text-foreground/70">Loading contests...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PageHeader 
        title="Contests" 
        subtitle="Register and compete with others"
        showProfile={true}
      />

      <main className="mx-auto w-full max-w-6xl px-6 pb-16">
        {error && (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-600 mb-4">
            {error}
          </div>
        )}

        {contests.length === 0 ? (
          <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.03] p-8 text-center">
            <div className="text-sm text-foreground/70">No contests available yet</div>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {contests.map((contest) => {
              const status = getContestStatus(contest.startDate, contest.endDate, contest.isRegistered);
              const isFull = contest.participantCount >= contest.maxParticipants;

              return (
                <div key={contest._id} className="rounded-2xl border border-foreground/10 bg-background p-6 hover:border-foreground/20 transition-all">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-start gap-3">
                        <div>
                          <h3 className="text-lg font-semibold">{contest.name}</h3>
                          <div className="mt-2 flex gap-2">
                            {contest.type === "coding" && (
                              <span className="inline-flex items-center rounded-full bg-blue-500/20 px-2 py-1 text-xs font-medium text-blue-600">
                                💻 Coding
                              </span>
                            )}
                            {contest.frequency && (
                              <span className="inline-flex items-center rounded-full bg-purple-500/20 px-2 py-1 text-xs font-medium text-purple-600">
                                📅 {contest.frequency.charAt(0).toUpperCase() + contest.frequency.slice(1)}
                              </span>
                            )}
                            {contest.problemCount && (
                              <span className="inline-flex items-center rounded-full bg-green-500/20 px-2 py-1 text-xs font-medium text-green-600">
                                🎯 {contest.problemCount} problems
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <p className="mt-3 text-sm text-foreground/70">{contest.description}</p>

                      <div className="mt-4 grid gap-2 text-sm">
                        <div>
                          <span className="font-medium">Starts:</span> {new Date(contest.startDate).toLocaleString()}
                        </div>
                        <div>
                          <span className="font-medium">Ends:</span> {new Date(contest.endDate).toLocaleString()}
                        </div>
                        <div>
                          <span className="font-medium">Participants:</span> {contest.participantCount} / {contest.maxParticipants}
                        </div>
                      </div>

                      {contest.problems && contest.problems.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-foreground/10">
                          <p className="text-xs font-medium text-foreground/70 mb-2">Problems:</p>
                          <div className="flex flex-wrap gap-2">
                            {contest.problems.slice(0, 3).map((problem, idx) => (
                              <div key={idx} className="text-xs px-2 py-1 rounded bg-foreground/5 border border-foreground/10">
                                <div className="font-medium truncate">{problem.title}</div>
                                <div className="text-foreground/60">{problem.difficulty}</div>
                              </div>
                            ))}
                            {contest.problems.length > 3 && (
                              <div className="text-xs px-2 py-1 rounded bg-foreground/5 border border-foreground/10 font-medium text-foreground/60">
                                +{contest.problems.length - 3} more
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <span
                        className={`inline-flex items-center justify-center rounded-full px-3 py-1 text-xs font-medium ${
                          status === "Upcoming"
                            ? "bg-blue-500/20 text-blue-600"
                            : status === "Active"
                              ? "bg-green-500/20 text-green-600"
                              : status === "Ended"
                                ? "bg-gray-500/20 text-gray-600"
                                : "bg-yellow-500/20 text-yellow-600"
                        }`}
                      >
                        {status}
                      </span>

                      {!contest.isRegistered && isFull && (
                        <button
                          disabled
                          className="inline-flex h-9 items-center justify-center rounded-full border border-foreground/15 px-4 text-xs font-medium opacity-50 cursor-not-allowed"
                        >
                          Full
                        </button>
                      )}

                      {!contest.isRegistered && !isFull && (
                        <button
                          onClick={() => handleRegister(contest._id)}
                          disabled={registering === contest._id}
                          className="inline-flex h-9 items-center justify-center rounded-full bg-foreground px-4 text-xs font-medium text-background hover:opacity-90 disabled:opacity-60"
                        >
                          {registering === contest._id ? "Registering..." : "Register"}
                        </button>
                      )}

                      {contest.isRegistered && (
                        <Link
                          href={`/contests/${contest._id}`}
                          className="inline-flex h-9 items-center justify-center rounded-full border border-foreground/15 px-4 text-xs font-medium hover:bg-foreground/5"
                        >
                          View Details
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
