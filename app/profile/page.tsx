'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface ProfileData {
  user: {
    id: string;
    email: string;
    name: string;
    isAdmin: boolean;
  };
  metrics: {
    interviewScore: number;
    interviewCount: number;
    contestScore: number;
    contestCount: number;
    contestWins: number;
    eloRating: number;
    totalScore: number;
    performance: string;
    consistency: number;
    recentActivity: number;
    overallScore: number;
  };
  stats: {
    totalInterviews: number;
    completedInterviews: number;
    acceptanceRate: number;
    totalContests: number;
    rank: number;
  };
  breakdown: {
    byDifficulty: { easy: number; medium: number; hard: number };
    byType: { hr: number; technical: number; behavioral: number };
    byRole: Array<{ role: string; interviews: number; avgScore: number }>;
  };
  recentSubmissions: Array<{
    id: string;
    role: string;
    type: string;
    difficulty: string;
    score: number;
    createdAt: string;
  }>;
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await fetch('/api/profile');
        const data = await res.json();

        if (data.ok) {
          setProfile(data.profile);
        } else {
          setError(data.error || 'Failed to load profile');
        }
      } catch (err) {
        console.error('Error loading profile:', err);
        setError('Failed to load profile');
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground p-6">
        <div className="mx-auto max-w-6xl">
          <p className="text-center text-foreground/70">Loading profile...</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-background text-foreground p-6">
        <div className="mx-auto max-w-6xl">
          <p className="text-center text-red-600">{error || 'Failed to load profile'}</p>
          <div className="mt-4 text-center">
            <Link href="/" className="text-blue-600 hover:underline">
              Back to home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty.toLowerCase()) {
      case 'easy':
        return 'text-green-600';
      case 'medium':
        return 'text-yellow-600';
      case 'hard':
        return 'text-red-600';
      default:
        return 'text-foreground/70';
    }
  };

  const getDifficultyBgColor = (difficulty: string) => {
    switch (difficulty.toLowerCase()) {
      case 'easy':
        return 'bg-green-600/10';
      case 'medium':
        return 'bg-yellow-600/10';
      case 'hard':
        return 'bg-red-600/10';
      default:
        return 'bg-foreground/5';
    }
  };

  const getPerformanceColor = (performance: string) => {
    switch (performance) {
      case 'Master':
        return 'text-amber-600';
      case 'Expert':
        return 'text-purple-600';
      case 'Advanced':
        return 'text-blue-600';
      case 'Intermediate':
        return 'text-green-600';
      case 'Beginner':
        return 'text-gray-600';
      default:
        return 'text-foreground/70';
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header Section */}
      <div className="border-b border-foreground/10">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-6">
              {/* Avatar */}
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-3xl font-bold text-white">
                {profile.user.name?.charAt(0).toUpperCase() || profile.user.email.charAt(0).toUpperCase()}
              </div>

              {/* User Info */}
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-3xl font-bold">{profile.user.name || profile.user.email.split('@')[0]}</h1>
                  {profile.user.isAdmin && (
                    <span className="px-3 py-1 rounded-full bg-amber-600/20 text-amber-600 text-xs font-semibold">
                      Admin
                    </span>
                  )}
                </div>
                <p className="text-foreground/70 mt-2">{profile.user.email}</p>
                {profile.stats.rank > 0 && (
                  <p className="text-sm text-foreground/60 mt-1">
                    Rank: <span className="font-semibold text-foreground">#{profile.stats.rank}</span>
                  </p>
                )}
              </div>
            </div>

            {/* Quick Stats */}
            <div className="text-right">
              <div className={`text-4xl font-bold ${getPerformanceColor(profile.metrics.performance)}`}>
                {profile.metrics.overallScore.toFixed(0)}
              </div>
              <p className="text-sm text-foreground/70 mt-1">{profile.metrics.performance}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Stats */}
          <div className="lg:col-span-1 space-y-6">
            {/* Key Metrics */}
            <div className="rounded-lg border border-foreground/10 bg-foreground/[0.02] p-6">
              <h2 className="font-semibold mb-4">Interview Stats</h2>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-foreground/70">Total</span>
                  <span className="text-2xl font-bold">{profile.stats.totalInterviews}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-foreground/70">Completed</span>
                  <span className="text-2xl font-bold text-green-600">{profile.stats.completedInterviews}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-foreground/70">Acceptance Rate</span>
                  <span className="text-2xl font-bold">{profile.stats.acceptanceRate}%</span>
                </div>
                <div className="pt-2 border-t border-foreground/10">
                  <div className="flex justify-between items-center">
                    <span className="text-foreground/70">Avg Score</span>
                    <span className="text-2xl font-bold text-blue-600">
                      {profile.metrics.interviewScore.toFixed(1)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Contest Stats */}
            <div className="rounded-lg border border-foreground/10 bg-foreground/[0.02] p-6">
              <h2 className="font-semibold mb-4">Contest Stats</h2>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-foreground/70">Participated</span>
                  <span className="text-2xl font-bold">{profile.stats.totalContests}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-foreground/70">Wins</span>
                  <span className="text-2xl font-bold text-amber-600">{profile.metrics.contestWins}</span>
                </div>
                <div className="pt-2 border-t border-foreground/10">
                  <div className="flex justify-between items-center">
                    <span className="text-foreground/70">ELO Rating</span>
                    <span className="text-2xl font-bold">{profile.metrics.eloRating}</span>
                  </div>
                  <div className="flex justify-between items-center mt-3">
                    <span className="text-foreground/70">Consistency</span>
                    <span className="text-2xl font-bold">{profile.metrics.consistency.toFixed(0)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Performance Badge */}
            <div className="rounded-lg border border-foreground/10 bg-foreground/[0.02] p-6 text-center">
              <h2 className="font-semibold mb-4">Performance Tier</h2>
              <div className={`text-4xl font-bold ${getPerformanceColor(profile.metrics.performance)} mb-2`}>
                {profile.metrics.performance}
              </div>
              <p className="text-xs text-foreground/70">
                {profile.metrics.performance === 'Master' && 'Exceptional skills and dedication'}
                {profile.metrics.performance === 'Expert' && 'Outstanding performance'}
                {profile.metrics.performance === 'Advanced' && 'Strong technical skills'}
                {profile.metrics.performance === 'Intermediate' && 'Good progress'}
                {profile.metrics.performance === 'Beginner' && 'Keep practicing'}
              </p>
            </div>
          </div>

          {/* Right Column - Breakdowns */}
          <div className="lg:col-span-2 space-y-6">
            {/* Difficulty Breakdown */}
            <div className="rounded-lg border border-foreground/10 bg-foreground/[0.02] p-6">
              <h2 className="font-semibold mb-4">Difficulty Breakdown</h2>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-4 rounded-lg bg-green-600/10">
                  <div className="text-3xl font-bold text-green-600">
                    {profile.breakdown.byDifficulty.easy}
                  </div>
                  <p className="text-sm text-foreground/70 mt-2">Easy</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-yellow-600/10">
                  <div className="text-3xl font-bold text-yellow-600">
                    {profile.breakdown.byDifficulty.medium}
                  </div>
                  <p className="text-sm text-foreground/70 mt-2">Medium</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-red-600/10">
                  <div className="text-3xl font-bold text-red-600">
                    {profile.breakdown.byDifficulty.hard}
                  </div>
                  <p className="text-sm text-foreground/70 mt-2">Hard</p>
                </div>
              </div>
            </div>

            {/* Interview Type Breakdown */}
            <div className="rounded-lg border border-foreground/10 bg-foreground/[0.02] p-6">
              <h2 className="font-semibold mb-4">Interview Type Breakdown</h2>
              <div className="space-y-3">
                {[
                  { label: 'Technical', value: profile.breakdown.byType.technical, color: 'bg-blue-600' },
                  { label: 'HR', value: profile.breakdown.byType.hr, color: 'bg-purple-600' },
                  { label: 'Behavioral', value: profile.breakdown.byType.behavioral, color: 'bg-green-600' },
                ].map((type) => (
                  <div key={type.label}>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium">{type.label}</span>
                      <span className="text-sm font-semibold">{type.value}</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-foreground/10 overflow-hidden">
                      <div
                        className={`h-full ${type.color}`}
                        style={{
                          width: `${
                            profile.stats.totalInterviews > 0
                              ? (type.value / profile.stats.totalInterviews) * 100
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Top Roles */}
            {profile.breakdown.byRole.length > 0 && (
              <div className="rounded-lg border border-foreground/10 bg-foreground/[0.02] p-6">
                <h2 className="font-semibold mb-4">Top Interview Roles</h2>
                <div className="space-y-2">
                  {profile.breakdown.byRole.map((role, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-3 rounded-lg border border-foreground/10 hover:bg-foreground/5 transition"
                    >
                      <div>
                        <div className="font-medium capitalize">{role.role}</div>
                        <div className="text-xs text-foreground/70">{role.interviews} interview(s)</div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-blue-600">{role.avgScore}</div>
                        <div className="text-xs text-foreground/70">avg score</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Recent Submissions */}
        <div className="mt-8 rounded-lg border border-foreground/10 bg-foreground/[0.02] p-6">
          <h2 className="font-semibold mb-4">Recent Interviews</h2>
          {profile.recentSubmissions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-foreground/10">
                    <th className="text-left py-3 px-4 font-medium text-foreground/70">Role</th>
                    <th className="text-left py-3 px-4 font-medium text-foreground/70">Type</th>
                    <th className="text-left py-3 px-4 font-medium text-foreground/70">Difficulty</th>
                    <th className="text-left py-3 px-4 font-medium text-foreground/70">Score</th>
                    <th className="text-left py-3 px-4 font-medium text-foreground/70">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {profile.recentSubmissions.map((sub) => (
                    <tr key={sub.id} className="border-b border-foreground/10 hover:bg-foreground/5 transition">
                      <td className="py-3 px-4 capitalize">{sub.role || 'Unknown'}</td>
                      <td className="py-3 px-4 capitalize">{sub.type || 'Unknown'}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-1 rounded text-xs font-semibold ${getDifficultyBgColor(
                            sub.difficulty
                          )} ${getDifficultyColor(sub.difficulty)}`}
                        >
                          {sub.difficulty || 'Unknown'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-semibold text-blue-600">{(sub.score ?? 0).toFixed(1)}</span>
                      </td>
                      <td className="py-3 px-4 text-foreground/70">
                        {new Date(sub.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-foreground/70">
              <p>No interviews yet. Start your journey with an interview!</p>
              <Link href="/interview/setup" className="text-blue-600 hover:underline mt-2 inline-block">
                Take an Interview →
              </Link>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="mt-8 flex gap-4 justify-center">
          <Link
            href="/interview/setup"
            className="inline-flex h-10 items-center justify-center rounded-lg bg-blue-600 px-6 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Take Interview
          </Link>
          <Link
            href="/contests"
            className="inline-flex h-10 items-center justify-center rounded-lg border border-foreground/10 px-6 text-sm font-semibold hover:bg-foreground/5"
          >
            Participate in Contests
          </Link>
          <Link
            href="/feedback"
            className="inline-flex h-10 items-center justify-center rounded-lg border border-foreground/10 px-6 text-sm font-semibold hover:bg-foreground/5"
          >
            View Detailed Feedback
          </Link>
        </div>
      </div>
    </div>
  );
}
