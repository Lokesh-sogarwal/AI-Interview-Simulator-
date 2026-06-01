"use client";

import { useEffect, useState } from "react";

interface Challenge {
  id: string;
  title: string;
  description: string;
  reward: number;
  icon: string;
  completed?: boolean;
}

export default function DailyChallenges() {
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [totalReward, setTotalReward] = useState(0);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState<string | null>(null);

  useEffect(() => {
    fetchChallenges();
  }, []);

  const fetchChallenges = async () => {
    try {
      const res = await fetch("/api/gamification/challenges");
      if (res.ok) {
        const data = await res.json();
        setChallenges(data.challenges || []);
        setTotalReward(data.totalRewardToday || 0);
      }
    } catch (error) {
      console.error("Failed to fetch challenges:", error);
    } finally {
      setLoading(false);
    }
  };

  const completeChallenge = async (challengeId: string) => {
    setCompleting(challengeId);
    try {
      const res = await fetch("/api/gamification/challenges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId }),
      });

      if (res.ok) {
        const data = await res.json();
        setChallenges((prev) =>
          prev.map((c) => (c.id === challengeId ? { ...c, completed: true } : c))
        );
        setTotalReward((prev) => prev + data.reward);
      }
    } catch (error) {
      console.error("Failed to complete challenge:", error);
    } finally {
      setCompleting(null);
    }
  };

  if (loading) {
    return <div className="text-sm text-foreground/70">Loading challenges...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Daily Challenges</h3>
        {totalReward > 0 && (
          <div className="inline-flex items-center gap-1 rounded-full bg-foreground/10 px-3 py-1 text-sm font-medium">
            <span>+{totalReward}</span>
            <span>points today</span>
          </div>
        )}
      </div>

      <div className="grid gap-3">
        {challenges.map((challenge) => (
          <div
            key={challenge.id}
            className={`rounded-lg border p-4 transition-all ${
              challenge.completed
                ? "border-foreground/10 bg-foreground/5 opacity-60"
                : "border-foreground/15 bg-background hover:border-foreground/25"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex gap-3 flex-1">
                <span className="text-2xl">{challenge.icon}</span>
                <div className="flex-1">
                  <div className="font-medium">{challenge.title}</div>
                  <div className="text-sm text-foreground/70">{challenge.description}</div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-foreground/10 px-2 py-1 text-sm font-medium">
                  +{challenge.reward}
                </span>

                {!challenge.completed ? (
                  <button
                    onClick={() => completeChallenge(challenge.id)}
                    disabled={completing === challenge.id}
                    className="inline-flex h-9 items-center justify-center rounded-full bg-foreground px-4 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-60"
                  >
                    {completing === challenge.id ? "..." : "Claim"}
                  </button>
                ) : (
                  <div className="inline-flex items-center justify-center rounded-full bg-foreground/10 px-4 py-2 text-sm font-medium">
                    ✓ Done
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
