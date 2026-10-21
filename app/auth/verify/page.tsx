"use client";

import { useState } from "react";
import { Mail, Phone } from "lucide-react";

import { Alert, Button, Field, Input } from "@/app/components/ui";

type Result = { tone: "success" | "error"; text: string } | null;

async function post(url: string, body: unknown): Promise<Result> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = (await res.json().catch(() => null)) as { ok: boolean; error?: string; message?: string } | null;
    if (res.ok && data?.ok) return { tone: "success", text: data.message || "Done." };
    return { tone: "error", text: data?.error || "Request failed. Please try again." };
  } catch {
    return { tone: "error", text: "Could not reach the server. Please try again." };
  }
}

export default function VerifyAccountPage() {
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState<"email" | "sendOtp" | "verifyOtp" | null>(null);
  const [emailResult, setEmailResult] = useState<Result>(null);
  const [otpResult, setOtpResult] = useState<Result>(null);
  const [otpSent, setOtpSent] = useState(false);

  async function run(kind: NonNullable<typeof busy>, fn: () => Promise<void>) {
    setBusy(kind);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-text">Verify your account</h1>
        <p className="mt-1.5 text-sm text-muted">Confirm your email address or phone number.</p>
      </div>

      <Field label="Account email" required>
        {({ id }) => <Input id={id} type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />}
      </Field>

      <section aria-labelledby="email-verify" className="grid gap-3 rounded-control border border-border p-4">
        <h2 id="email-verify" className="flex items-center gap-2 text-sm font-semibold text-text">
          <Mail className="size-4 text-muted" aria-hidden /> Email
        </h2>
        <p className="text-sm text-muted">We’ll send a verification link to the address above if it belongs to an unverified account.</p>
        <Button
          variant="secondary"
          loading={busy === "email"}
          disabled={!email.trim()}
          onClick={() => run("email", async () => setEmailResult(await post("/api/auth/send-email-verification", { email })))}
        >
          Send verification link
        </Button>
        {emailResult ? <Alert tone={emailResult.tone}>{emailResult.text}</Alert> : null}
      </section>

      <section aria-labelledby="phone-verify" className="grid gap-3 rounded-control border border-border p-4">
        <h2 id="phone-verify" className="flex items-center gap-2 text-sm font-semibold text-text">
          <Phone className="size-4 text-muted" aria-hidden /> Phone
        </h2>
        <p className="text-sm text-muted">If your account has a phone number, we’ll send a 6-digit code that expires in 5 minutes.</p>
        <Button
          variant="secondary"
          loading={busy === "sendOtp"}
          disabled={!email.trim()}
          onClick={() =>
            run("sendOtp", async () => {
              const r = await post("/api/auth/send-phone-otp", { email });
              setOtpResult(r);
              if (r?.tone === "success") setOtpSent(true);
            })
          }
        >
          Send code
        </Button>
        {otpSent ? (
          <form
            className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              void run("verifyOtp", async () => {
                const r = await post("/api/auth/verify-phone-otp", { email, otp });
                setOtpResult(r?.tone === "success" ? { tone: "success", text: "Your phone number is verified." } : r);
              });
            }}
          >
            <Field label="6-digit code">
              {({ id }) => (
                <Input id={id} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" />
              )}
            </Field>
            <Button type="submit" loading={busy === "verifyOtp"} disabled={otp.length !== 6}>
              Verify
            </Button>
          </form>
        ) : null}
        {otpResult ? <Alert tone={otpResult.tone}>{otpResult.text}</Alert> : null}
      </section>
    </div>
  );
}
