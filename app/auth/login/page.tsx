"use client";

import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">(
    "idle",
  );
  const [message, setMessage] = useState<string>("");

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!email || !password) {
      setStatus("error");
      setMessage("Please enter your email and password.");
      return;
    }

    setStatus("loading");
    setMessage("Signing you in…");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { ok: true; user: { id: string; name: string; email: string } }
        | { ok: false; error: string }
        | null;

      if (!response.ok || !payload || payload.ok === false) {
        setStatus("error");
        setMessage(
          payload && "error" in payload && payload.error
            ? payload.error
            : "Could not sign in. Please try again.",
        );
        return;
      }

      setStatus("success");
      setMessage("Signed in. Redirecting…");
      window.location.href = "/";
    } catch {
      setStatus("error");
      setMessage("Could not sign in. Please try again.");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
        <p className="text-sm leading-6 text-foreground/70">
          Sign in to continue your AI interview practice.
        </p>
      </div>

      <form onSubmit={onSubmit} className="grid gap-4">
        <label className="grid gap-2">
          <span className="text-sm font-medium">Email</span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            autoComplete="email"
            className="h-11 rounded-2xl border border-foreground/15 bg-background px-4 text-sm outline-none focus:border-foreground/30"
            placeholder="you@company.com"
          />
        </label>

        <label className="grid gap-2">
          <span className="text-sm font-medium">Password</span>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete="current-password"
            className="h-11 rounded-2xl border border-foreground/15 bg-background px-4 text-sm outline-none focus:border-foreground/30"
            placeholder="••••••••"
          />
        </label>

        <button
          type="submit"
          disabled={status === "loading"}
          className="inline-flex h-11 items-center justify-center rounded-full bg-foreground px-5 text-sm font-medium text-background transition-opacity enabled:hover:opacity-90 disabled:opacity-60"
        >
          {status === "loading" ? "Signing in…" : "Sign in"}
        </button>

        <div
          className={
            status === "error"
              ? "text-sm text-foreground"
              : "text-sm text-foreground/70"
          }
          aria-live="polite"
        >
          {message || "Sign in with your account."}
        </div>
      </form>

      <div className="text-sm text-foreground/70">
        Don’t have an account?{" "}
        <a href="/auth/signup" className="font-medium text-foreground">
          Create one
        </a>
        .
      </div>
    </div>
  );
}
