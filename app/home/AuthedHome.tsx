"use client";

import { useEffect, useState } from "react";
import PageHeader from "../components/PageHeader";

interface Interview {
    _id: string;
    userId: string;
    score?: number;
    duration?: number;
    createdAt?: string;
}

interface Stats {
    contestsCompleted: number;
    totalScore: number;
    rating: number;
}

export default function AuthedHome() {
    const [interviews, setInterviews] = useState<Interview[]>([]);
    const [stats, setStats] = useState<Stats | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [interviewRes, statsRes] = await Promise.all([
                    fetch("/api/interviews"),
                    fetch("/api/users/stats"),
                ]);

                if (interviewRes.ok) {
                    const data = await interviewRes.json();
                    setInterviews(data.interviews || []);
                }

                if (statsRes.ok) {
                    const data = await statsRes.json();
                    setStats(data.stats);
                }
            } catch (error) {
                console.error("Error fetching data:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    const completedInterviews = interviews.length;
    const averageScore =
        interviews.length > 0
            ? Math.round(
                interviews.reduce((sum, interview) => sum + (interview.score || 0), 0) /
                interviews.length
            )
            : 0;
    
    const totalPracticeTime = interviews.length > 0
        ? Math.round(
            interviews.reduce((sum, interview) => sum + (interview.duration || 0), 0) / 60
        )
        : 0;

    return (
        <div className="min-h-dvh bg-background text-foreground">
            {/* Header with Profile Dropdown */}
            <PageHeader 
                title="Dashboard" 
                subtitle="Welcome back"
                showProfile={true}
            />

            <main className="mx-auto w-full max-w-6xl px-6 py-8 pb-16">
                {/* Welcome Section */}
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
                    <p className="mt-2 text-foreground/70">Your interview preparation journey</p>
                </div>

                {/* Primary Action Cards */}
                <div className="mb-8 grid gap-4 md:grid-cols-2">
                    {/* Start Interview Card */}
                    <div className="rounded-xl border border-foreground/10 bg-gradient-to-br from-blue-500/5 to-purple-500/5 p-8 hover:border-foreground/20 transition-all">
                        <div className="flex items-start justify-between mb-6">
                            <div className="flex-1">
                                <h3 className="text-2xl font-semibold text-foreground">🎤</h3>
                                <h2 className="text-xl font-bold text-foreground mt-2">Take Interview</h2>
                                <p className="mt-2 text-sm text-foreground/70">Start a new AI-powered HR interview session</p>
                            </div>
                        </div>
                        <div className="space-y-2 mb-4">
                            <p className="text-xs text-foreground/60 flex items-center gap-2">
                                ✓ Real-time feedback
                            </p>
                            <p className="text-xs text-foreground/60 flex items-center gap-2">
                                ✓ Personalized questions
                            </p>
                            <p className="text-xs text-foreground/60 flex items-center gap-2">
                                ✓ Detailed score report
                            </p>
                        </div>
                        <a
                            href="/interview/setup"
                            className="inline-flex h-10 items-center justify-center rounded-lg bg-blue-600 px-6 text-sm font-medium text-white transition-all hover:bg-blue-700 w-full"
                        >
                            Begin Interview
                        </a>
                    </div>

                    {/* Practice Contests Card */}
                    <div className="rounded-xl border border-foreground/10 bg-gradient-to-br from-green-500/5 to-emerald-500/5 p-8 hover:border-foreground/20 transition-all">
                        <div className="flex items-start justify-between mb-6">
                            <div className="flex-1">
                                <h3 className="text-2xl font-semibold text-foreground">🏆</h3>
                                <h2 className="text-xl font-bold text-foreground mt-2">Coding Contests</h2>
                                <p className="mt-2 text-sm text-foreground/70">Solve coding challenges and compete globally</p>
                            </div>
                        </div>
                        <div className="space-y-2 mb-4">
                            <p className="text-xs text-foreground/60 flex items-center gap-2">
                                ✓ LeetCode-style problems
                            </p>
                            <p className="text-xs text-foreground/60 flex items-center gap-2">
                                ✓ Live leaderboard
                            </p>
                            <p className="text-xs text-foreground/60 flex items-center gap-2">
                                ✓ Instant evaluation
                            </p>
                        </div>
                        <a
                            href="/contests"
                            className="inline-flex h-10 items-center justify-center rounded-lg bg-green-600 px-6 text-sm font-medium text-white transition-all hover:bg-green-700 w-full"
                        >
                            View Contests
                        </a>
                    </div>
                </div>

                {/* Stats Overview Section */}
                <div className="mb-8">
                    <h2 className="text-lg font-semibold text-foreground mb-4">Your Progress</h2>
                    <div className="grid gap-4 md:grid-cols-4">
                        {/* Total Interviews */}
                        <div className="rounded-lg border border-foreground/10 bg-foreground/[0.02] p-4">
                            <div className="text-2xl font-bold text-blue-600">
                                {loading ? "..." : completedInterviews}
                            </div>
                            <p className="text-sm text-foreground/70 mt-1">Interviews Completed</p>
                            <p className="text-xs text-foreground/50 mt-2">
                                {completedInterviews === 0
                                    ? "Start your first interview to track progress"
                                    : `Great work! Keep practicing`}
                            </p>
                        </div>

                        {/* Average Score */}
                        <div className="rounded-lg border border-foreground/10 bg-foreground/[0.02] p-4">
                            <div className="text-2xl font-bold text-green-600">
                                {loading ? "..." : averageScore === 0 ? "-" : `${averageScore}%`}
                            </div>
                            <p className="text-sm text-foreground/70 mt-1">Average Score</p>
                            <p className="text-xs text-foreground/50 mt-2">
                                {averageScore > 70 ? "Excellent performance!" : "Improve with each interview"}
                            </p>
                        </div>

                        {/* Total Practice Time */}
                        <div className="rounded-lg border border-foreground/10 bg-foreground/[0.02] p-4">
                            <div className="text-2xl font-bold text-purple-600">
                                {loading ? "..." : totalPracticeTime}
                                {!loading && "m"}
                            </div>
                            <p className="text-sm text-foreground/70 mt-1">Total Practice Time</p>
                            <p className="text-xs text-foreground/50 mt-2">
                                {totalPracticeTime > 60
                                    ? "Amazing dedication!"
                                    : "Consistent practice builds skills"}
                            </p>
                        </div>

                        {/* Contests Entered */}
                        <div className="rounded-lg border border-foreground/10 bg-foreground/[0.02] p-4">
                            <div className="text-2xl font-bold text-orange-600">
                                {loading ? "..." : stats?.contestsCompleted || 0}
                            </div>
                            <p className="text-sm text-foreground/70 mt-1">Contests Entered</p>
                            <p className="text-xs text-foreground/50 mt-2">
                                {(stats?.contestsCompleted || 0) > 0
                                    ? "Keep competing!"
                                    : "Compete and climb the rankings"}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Learning Path & Tips */}
                <div className="grid gap-8 lg:grid-cols-3 mb-8">
                    {/* Getting Started */}
                    <div className="lg:col-span-2 rounded-xl border border-foreground/10 bg-foreground/[0.02] p-6">
                        <h3 className="text-lg font-semibold text-foreground mb-4">🚀 Getting Started</h3>
                        <div className="space-y-3">
                            <div className="flex gap-3">
                                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-600 text-white text-sm font-semibold flex-shrink-0">1</div>
                                <div>
                                    <p className="font-medium text-foreground">Set Your Interview Goals</p>
                                    <p className="text-sm text-foreground/70 mt-1">Choose your interview type, difficulty, and target role</p>
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-600 text-white text-sm font-semibold flex-shrink-0">2</div>
                                <div>
                                    <p className="font-medium text-foreground">Practice Interviews</p>
                                    <p className="text-sm text-foreground/70 mt-1">Complete multiple interviews and get AI-powered feedback</p>
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-600 text-white text-sm font-semibold flex-shrink-0">3</div>
                                <div>
                                    <p className="font-medium text-foreground">Solve Coding Problems</p>
                                    <p className="text-sm text-foreground/70 mt-1">Participate in contests and improve your problem-solving skills</p>
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-600 text-white text-sm font-semibold flex-shrink-0">4</div>
                                <div>
                                    <p className="font-medium text-foreground">Track & Improve</p>
                                    <p className="text-sm text-foreground/70 mt-1">Monitor your progress and refine your interview skills</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Quick Tips */}
                    <div className="rounded-xl border border-foreground/10 bg-gradient-to-br from-amber-500/5 to-orange-500/5 p-6">
                        <h3 className="text-lg font-semibold text-foreground mb-4">💡 Pro Tips</h3>
                        <div className="space-y-3">
                            <div className="p-3 rounded-lg bg-background/40 border border-foreground/5">
                                <p className="text-sm font-medium text-foreground">Stay Consistent</p>
                                <p className="text-xs text-foreground/60 mt-1">Practice regularly to build confidence</p>
                            </div>
                            <div className="p-3 rounded-lg bg-background/40 border border-foreground/5">
                                <p className="text-sm font-medium text-foreground">Review Feedback</p>
                                <p className="text-xs text-foreground/60 mt-1">Learn from detailed AI analysis</p>
                            </div>
                            <div className="p-3 rounded-lg bg-background/40 border border-foreground/5">
                                <p className="text-sm font-medium text-foreground">Compete & Learn</p>
                                <p className="text-xs text-foreground/60 mt-1">Test your skills in live contests</p>
                            </div>
                            <div className="p-3 rounded-lg bg-background/40 border border-foreground/5">
                                <p className="text-sm font-medium text-foreground">View Your History</p>
                                <p className="text-xs text-foreground/60 mt-1">Track improvements over time</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Features Highlight */}
                <div>
                    <h3 className="text-lg font-semibold text-foreground mb-4">✨ Why Choose Us?</h3>
                    <div className="grid gap-4 md:grid-cols-3">
                        <div className="rounded-lg border border-foreground/10 p-5 bg-background hover:border-foreground/20 transition-all">
                            <div className="text-3xl mb-3">🤖</div>
                            <div className="font-medium text-foreground">AI-Powered Feedback</div>
                            <p className="text-xs text-foreground/70 mt-3">Advanced AI analyzes your responses and provides actionable insights for improvement</p>
                        </div>
                        <div className="rounded-lg border border-foreground/10 p-5 bg-background hover:border-foreground/20 transition-all">
                            <div className="text-3xl mb-3">⚡</div>
                            <div className="font-medium text-foreground">Instant Results</div>
                            <p className="text-xs text-foreground/70 mt-3">Get detailed scoring and feedback immediately after each interview session</p>
                        </div>
                        <div className="rounded-lg border border-foreground/10 p-5 bg-background hover:border-foreground/20 transition-all">
                            <div className="text-3xl mb-3">📊</div>
                            <div className="font-medium text-foreground">Track Progress</div>
                            <p className="text-xs text-foreground/70 mt-3">View your complete interview history and see how you improve over time</p>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
