"use client";

import Link from "next/link";
import { useState } from "react";

import { Alert, Button, Field, Input } from "@/app/components/ui";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const errors: typeof fieldErrors = {};
    if (!email.trim()) errors.email = "Enter your email address.";
    if (!password) errors.password = "Enter your password.";
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;

    setLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const payload = (await response.json().catch(() => null)) as { ok: boolean; error?: string } | null;

      if (!response.ok || !payload?.ok) {
        setError(payload?.error || "Could not sign in. Please try again.");
        setLoading(false);
        return;
      }

      window.location.href = "/";
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-text">Welcome back</h1>
        <p className="mt-1.5 text-sm text-muted">Sign in to continue your interview practice.</p>
      </div>

      {error ? <Alert tone="error">{error}</Alert> : null}

      <form onSubmit={onSubmit} className="grid gap-4" noValidate>
        <Field label="Email" error={fieldErrors.email} required>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder="you@example.com"
              aria-describedby={describedBy}
              aria-invalid={invalid}
            />
          )}
        </Field>

        <Field label="Password" error={fieldErrors.password} required>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="current-password"
              aria-describedby={describedBy}
              aria-invalid={invalid}
            />
          )}
        </Field>

        <Button type="submit" size="lg" loading={loading} className="mt-1 w-full">
          {loading ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <p className="text-sm text-muted">
        New here?{" "}
        <Link href="/auth/signup" className="font-semibold text-text underline-offset-2 hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
