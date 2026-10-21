"use client";

import Link from "next/link";
import { useState } from "react";

import { Alert, Button, Field, Input } from "@/app/components/ui";

type Errors = Partial<Record<"name" | "email" | "password" | "dob" | "phone", string>>;

function ageFrom(dob: string) {
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age;
}

/** Mirrors the server-side rules so problems are shown next to the field. */
function validate(v: { name: string; email: string; password: string; dob: string; phone: string }): Errors {
  const errors: Errors = {};
  if (!v.name.trim()) errors.name = "Enter your name.";
  else if (v.name.trim().length > 80) errors.name = "Name must be 80 characters or fewer.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) errors.email = "Enter a valid email address.";
  if (v.password.length < 8) errors.password = "Use at least 8 characters.";
  else if (v.password.length > 72) errors.password = "Use 72 characters or fewer.";
  const age = v.dob ? ageFrom(v.dob) : null;
  if (!v.dob || age === null) errors.dob = "Enter your date of birth.";
  else if (age < 16) errors.dob = "You must be at least 16 years old.";
  if (v.phone.trim() && !/^\+?[0-9\s-]{7,20}$/.test(v.phone.trim())) errors.phone = "Enter a valid phone number, e.g. +15551234567.";
  return errors;
}

export default function SignupPage() {
  const [values, setValues] = useState({ name: "", email: "", password: "", dob: "", phone: "" });
  const [errors, setErrors] = useState<Errors>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const set = (key: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) => setValues((v) => ({ ...v, [key]: e.target.value }));

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const next = validate(values);
    setErrors(next);
    if (Object.keys(next).length) return;

    setLoading(true);
    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const payload = (await response.json().catch(() => null)) as { ok: boolean; error?: string } | null;

      if (!response.ok || !payload?.ok) {
        setError(payload?.error || "Could not create your account. Please try again.");
        setLoading(false);
        return;
      }

      window.location.href = "/";
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
      setLoading(false);
    }
  }

  const maxDob = new Date().toISOString().slice(0, 10);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-text">Create your account</h1>
        <p className="mt-1.5 text-sm text-muted">Save your interviews, feedback and progress.</p>
      </div>

      {error ? <Alert tone="error">{error}</Alert> : null}

      <form onSubmit={onSubmit} className="grid gap-4" noValidate>
        <Field label="Full name" error={errors.name} required>
          {({ id, describedBy, invalid }) => (
            <Input id={id} value={values.name} onChange={set("name")} autoComplete="name" maxLength={80} aria-describedby={describedBy} aria-invalid={invalid} />
          )}
        </Field>
        <Field label="Email" error={errors.email} required>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              value={values.email}
              onChange={set("email")}
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.com"
              aria-describedby={describedBy}
              aria-invalid={invalid}
            />
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date of birth" error={errors.dob} hint="You must be 16 or older." required>
            {({ id, describedBy, invalid }) => (
              <Input id={id} value={values.dob} onChange={set("dob")} type="date" max={maxDob} autoComplete="bday" aria-describedby={describedBy} aria-invalid={invalid} />
            )}
          </Field>
          <Field label="Phone" error={errors.phone} hint="Optional">
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                value={values.phone}
                onChange={set("phone")}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="+15551234567"
                aria-describedby={describedBy}
                aria-invalid={invalid}
              />
            )}
          </Field>
        </div>
        <Field label="Password" error={errors.password} hint="At least 8 characters." required>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              value={values.password}
              onChange={set("password")}
              type="password"
              autoComplete="new-password"
              aria-describedby={describedBy}
              aria-invalid={invalid}
            />
          )}
        </Field>

        <Button type="submit" size="lg" loading={loading} className="mt-1 w-full">
          {loading ? "Creating account…" : "Create account"}
        </Button>
      </form>

      <p className="text-sm text-muted">
        Already have an account?{" "}
        <Link href="/auth/login" className="font-semibold text-text underline-offset-2 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
