export default function PublicLanding() {
  return (
    <div className="min-h-dvh bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="border-b border-foreground/10 bg-background">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 text-background">
              <span className="text-sm font-semibold">AI</span>
            </div>
            <div className="leading-tight">
              <div className="text-base font-semibold tracking-tight">Interview Simulator</div>
              <div className="text-xs text-foreground/70">Practice & Compete</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="/auth/login"
              className="inline-flex h-9 items-center justify-center rounded-lg border border-foreground/15 px-4 text-sm font-medium transition-all hover:border-foreground/30 hover:bg-foreground/5"
            >
              Sign in
            </a>
            <a
              href="/auth/signup"
              className="inline-flex h-9 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition-all hover:bg-blue-700"
            >
              Get Started
            </a>
          </div>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-6xl px-6 py-12">
        {/* Hero Section */}
        <div className="mb-16 grid gap-12 md:grid-cols-2 md:items-center">
          <div className="flex flex-col gap-6">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-foreground/15 bg-foreground/5 px-3 py-1 text-xs font-medium text-foreground">
              <span className="flex h-2 w-2 rounded-full bg-green-500"></span>
              Now with Coding Contests
            </div>

            <h1 className="text-balance text-4xl font-bold tracking-tight md:text-5xl">
              Master interviews & coding challenges
            </h1>

            <p className="text-base leading-7 text-foreground/75">
              Practice real HR interviews, solve coding problems, and compete with others. Get AI-powered feedback and track your progress on a dynamic leaderboard.
            </p>

            <div className="flex flex-col gap-3 sm:flex-row">
              <a
                href="/auth/signup"
                className="inline-flex h-11 items-center justify-center rounded-lg bg-blue-600 px-6 text-sm font-semibold text-white transition-all hover:bg-blue-700"
              >
                Start Free Practice
              </a>
              <a
                href="/auth/login"
                className="inline-flex h-11 items-center justify-center rounded-lg border border-foreground/15 px-6 text-sm font-medium transition-all hover:border-foreground/30 hover:bg-foreground/5"
              >
                Sign In
              </a>
            </div>

            <div className="pt-6 text-xs text-foreground/60">
              ✓ Free to use • ✓ No credit card needed • ✓ Start immediately
            </div>
          </div>

          {/* Feature Cards Grid */}
          <div className="grid gap-4">
            <div className="rounded-xl border border-foreground/10 bg-foreground/[0.02] p-5">
              <div className="text-2xl mb-2">🎤</div>
              <h3 className="font-semibold text-foreground">AI HR Interviews</h3>
              <p className="mt-1 text-sm text-foreground/70">Real-world HR-style questions with personalized feedback</p>
            </div>

            <div className="rounded-xl border border-foreground/10 bg-foreground/[0.02] p-5">
              <div className="text-2xl mb-2">💻</div>
              <h3 className="font-semibold text-foreground">Coding Challenges</h3>
              <p className="mt-1 text-sm text-foreground/70">Practice LeetCode-style problems and compete in contests</p>
            </div>

            <div className="rounded-xl border border-foreground/10 bg-foreground/[0.02] p-5">
              <div className="text-2xl mb-2">📊</div>
              <h3 className="font-semibold text-foreground">Global Leaderboard</h3>
              <p className="mt-1 text-sm text-foreground/70">Compete with others and track your ranking</p>
            </div>

            <div className="rounded-xl border border-foreground/10 bg-foreground/[0.02] p-5">
              <div className="text-2xl mb-2">⚡</div>
              <h3 className="font-semibold text-foreground">Instant Feedback</h3>
              <p className="mt-1 text-sm text-foreground/70">Get detailed AI analysis of your performance</p>
            </div>
          </div>
        </div>

        {/* How It Works Section */}
        <div className="mb-16">
          <h2 className="text-2xl font-bold text-foreground mb-8">How It Works</h2>
          <div className="grid gap-6 md:grid-cols-3">
            <div className="rounded-lg border border-foreground/10 bg-foreground/[0.02] p-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-600 text-white font-bold mb-4">
                1
              </div>
              <h3 className="font-semibold text-foreground mb-2">Create Account</h3>
              <p className="text-sm text-foreground/70">Sign up in seconds. Upload your resume for personalization.</p>
            </div>

            <div className="rounded-lg border border-foreground/10 bg-foreground/[0.02] p-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-600 text-white font-bold mb-4">
                2
              </div>
              <h3 className="font-semibold text-foreground mb-2">Practice & Compete</h3>
              <p className="text-sm text-foreground/70">Take interviews, solve coding problems, or join contests.</p>
            </div>

            <div className="rounded-lg border border-foreground/10 bg-foreground/[0.02] p-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-purple-600 text-white font-bold mb-4">
                3
              </div>
              <h3 className="font-semibold text-foreground mb-2">Get Feedback & Improve</h3>
              <p className="text-sm text-foreground/70">Review detailed analysis and track progress over time.</p>
            </div>
          </div>
        </div>

        {/* Features Section */}
        <div className="mb-16">
          <h2 className="text-2xl font-bold text-foreground mb-8">Features</h2>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-lg border border-foreground/10 p-6">
              <h3 className="font-semibold text-foreground mb-2">📄 Resume Analysis</h3>
              <p className="text-sm text-foreground/70">Upload your resume and get AI-tailored interview questions based on your skills and experience.</p>
            </div>

            <div className="rounded-lg border border-foreground/10 p-6">
              <h3 className="font-semibold text-foreground mb-2">🎙️ Typing & Video Mode</h3>
              <p className="text-sm text-foreground/70">Choose between typing answers or video interviews with voice and webcam interaction.</p>
            </div>

            <div className="rounded-lg border border-foreground/10 p-6">
              <h3 className="font-semibold text-foreground mb-2">🏆 Contests</h3>
              <p className="text-sm text-foreground/70">Participate in coding contests and compete with users worldwide on a live leaderboard.</p>
            </div>

            <div className="rounded-lg border border-foreground/10 p-6">
              <h3 className="font-semibold text-foreground mb-2">📈 Progress Tracking</h3>
              <p className="text-sm text-foreground/70">View all your interview history, scores, and improvements in one centralized dashboard.</p>
            </div>

            <div className="rounded-lg border border-foreground/10 p-6">
              <h3 className="font-semibold text-foreground mb-2">⚙️ Admin Features</h3>
              <p className="text-sm text-foreground/70">Create and manage contests, set up problems, and monitor participant progress.</p>
            </div>

            <div className="rounded-lg border border-foreground/10 p-6">
              <h3 className="font-semibold text-foreground mb-2">🔒 Secure & Private</h3>
              <p className="text-sm text-foreground/70">Your data is encrypted and secure. Only you can see your interview history and scores.</p>
            </div>
          </div>
        </div>

        {/* CTA Section */}
        <div className="rounded-xl border border-foreground/10 bg-gradient-to-r from-blue-500/10 to-purple-500/10 p-8 text-center">
          <h2 className="text-2xl font-bold text-foreground mb-2">Ready to get started?</h2>
          <p className="text-foreground/70 mb-6">Join thousands of developers improving their interview skills</p>
          <a
            href="/auth/signup"
            className="inline-flex h-11 items-center justify-center rounded-lg bg-blue-600 px-8 text-sm font-semibold text-white transition-all hover:bg-blue-700"
          >
            Create Free Account
          </a>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-foreground/10 bg-foreground/[0.02]">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <div className="text-center text-sm text-foreground/60">
            <p>Interview Simulator © 2026 • Practice • Compete • Improve</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
