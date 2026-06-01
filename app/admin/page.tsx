'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface User {
  id: string;
  email: string;
  isAdmin?: boolean;
}

export default function AdminDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await fetch('/api/user');
        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
          if (!data.user?.isAdmin) {
            router.push('/');
          }
        } else {
          router.push('/');
        }
      } catch (err) {
        console.error('Error fetching user:', err);
        router.push('/');
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, [router]);

  const handleGenerateContest = async () => {
    setGenerating(true);
    setMessage(null);

    try {
      const res = await fetch('/api/admin/generate-daily-contest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });

      const data = await res.json();

      if (data.ok) {
        setMessage({
          type: 'success',
          text: `✅ Contest "${data.contest.name}" created successfully! Contest ID: ${data.contestId}`,
        });
      } else {
        setMessage({
          type: 'error',
          text: `❌ Error: ${data.error}`,
        });
      }
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: `❌ Failed to generate contest: ${err.message}`,
      });
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground p-6">
        <div className="mx-auto max-w-6xl">
          <p className="text-center text-foreground/70">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user?.isAdmin) {
    return (
      <div className="min-h-screen bg-background text-foreground p-6">
        <div className="mx-auto max-w-6xl">
          <p className="text-center text-red-600">Access denied. Admin only.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-6xl px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-semibold">Admin Dashboard</h1>
          <p className="mt-2 text-foreground/70">Manage contests and system settings</p>
        </div>

        {/* Admin Info */}
        <div className="rounded-lg border border-foreground/10 bg-foreground/[0.02] p-6 mb-8">
          <h2 className="text-lg font-semibold mb-4">Admin Information</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-foreground/70">Email:</span>
              <span className="font-medium">{user.email}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-foreground/70">User ID:</span>
              <span className="font-medium font-mono text-xs">{user.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-foreground/70">Admin Status:</span>
              <span className="font-medium text-green-600">✓ Admin</span>
            </div>
          </div>
        </div>

        {/* Contest Generation Section */}
        <div className="rounded-lg border border-foreground/10 bg-foreground/[0.02] p-6">
          <h2 className="text-lg font-semibold mb-6">Generate Daily Contest</h2>

          <div className="space-y-4">
            {/* Information */}
            <div className="rounded-lg bg-blue-600/10 border border-blue-600/30 p-4">
              <p className="text-sm text-blue-600">
                <span className="font-semibold">ℹ️ What this does:</span>
                <br />
                Creates a new coding contest starting today with 3 AI-generated problems. 
                The contest runs for 7 days and supports Python, JavaScript, C++, and Java.
              </p>
            </div>

            {/* Success/Error Messages */}
            {message && (
              <div
                className={`rounded-lg p-4 border ${
                  message.type === 'success'
                    ? 'bg-green-600/10 border-green-600/30 text-green-600'
                    : 'bg-red-600/10 border-red-600/30 text-red-600'
                }`}
              >
                <p className="text-sm">{message.text}</p>
              </div>
            )}

            {/* Button */}
            <button
              onClick={handleGenerateContest}
              disabled={generating}
              className="w-full inline-flex h-12 items-center justify-center rounded-lg bg-green-600 px-6 text-base font-semibold text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {generating ? (
                <>
                  <span className="mr-2 inline-block animate-spin">⚙️</span>
                  Generating Contest...
                </>
              ) : (
                <>
                  <span className="mr-2">🚀</span>
                  Generate Daily Contest
                </>
              )}
            </button>

            {/* Additional Info */}
            <div className="pt-4 space-y-2 text-xs text-foreground/70">
              <p>
                <span className="font-medium">📝 Problems:</span> 3 auto-generated coding problems
              </p>
              <p>
                <span className="font-medium">🕐 Duration:</span> 7 days starting from today
              </p>
              <p>
                <span className="font-medium">💻 Languages:</span> Python, JavaScript, C++, Java
              </p>
              <p>
                <span className="font-medium">👥 Max Participants:</span> 500
              </p>
              <p>
                <span className="font-medium">🏆 Features:</span> Real-time code execution, leaderboards, ELO ratings
              </p>
            </div>
          </div>
        </div>

        {/* Quick Links */}
        <div className="mt-8 rounded-lg border border-foreground/10 bg-foreground/[0.02] p-6">
          <h2 className="text-lg font-semibold mb-4">Quick Links</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <a
              href="/contests"
              className="p-4 rounded-lg border border-foreground/10 hover:bg-foreground/5 transition"
            >
              <div className="font-semibold">📋 View Contests</div>
              <p className="text-xs text-foreground/70 mt-1">See all created contests</p>
            </a>
            <a
              href="/leaderboard"
              className="p-4 rounded-lg border border-foreground/10 hover:bg-foreground/5 transition"
            >
              <div className="font-semibold">🏆 Leaderboard</div>
              <p className="text-xs text-foreground/70 mt-1">View global rankings</p>
            </a>
            <a
              href="/"
              className="p-4 rounded-lg border border-foreground/10 hover:bg-foreground/5 transition"
            >
              <div className="font-semibold">🏠 Back to Home</div>
              <p className="text-xs text-foreground/70 mt-1">Return to main dashboard</p>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
