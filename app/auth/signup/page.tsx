"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { initFirebaseClient } from "@/lib/firebaseClient";
// dynamic-import `firebase/auth` at runtime to avoid build-time type errors

export default function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [dob, setDob] = useState("");
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">(
    "idle",
  );
  const [message, setMessage] = useState<string>("");

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!name || !email || !password || !dob) {
      setStatus("error");
      setMessage("Please fill in your name, email, and password.");
      return;
    }

    setStatus("loading");
    setMessage("Creating your account…");

    try {
      const auth = await initFirebaseClient();
      // @ts-ignore - dynamic import; types may be missing in the build environment
      const firebaseAuth = await import("firebase/auth");
      const { createUserWithEmailAndPassword, sendEmailVerification, signInWithPhoneNumber, RecaptchaVerifier } = firebaseAuth;
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      const user = cred.user;
      await sendEmailVerification(user);

      // If phone provided, prompt for verification
      if (phone) {
        // render invisible recaptcha
        if (!(window as any).recaptchaVerifier) {
          (window as any).recaptchaVerifier = new RecaptchaVerifier('recaptcha-container', { size: 'invisible' }, auth);
        }
        const confirmation: any = await signInWithPhoneNumber(auth, phone, (window as any).recaptchaVerifier);
        const code = window.prompt('Enter the SMS verification code');
        if (code) {
          await confirmation.confirm(code);
        }
      }

      setStatus('success');
      setMessage('Account created. Check your email to verify, then click Complete signup.');
    } catch (err: any) {
      setStatus('error');
      setMessage(err?.message || 'Could not create account. Please try again.');
    }
  }

  async function completeSignup() {
    try {
      setStatus('loading');
      setMessage('Finalizing signup…');
      const auth = await initFirebaseClient();
      const user = auth.currentUser;
      if (!user) {
        setStatus('error');
        setMessage('No authenticated Firebase user found.');
        return;
      }
      await user.reload();
      if (!user.emailVerified) {
        setStatus('error');
        setMessage('Please verify your email first (check your inbox).');
        return;
      }
      const idToken = await user.getIdToken();
      const resp = await fetch('/api/auth/signup-firebase', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken, dob }) });
      const payload = await resp.json().catch(() => null);
      if (!resp.ok || !payload || payload.ok === false) {
        setStatus('error');
        setMessage((payload && payload.error) || 'Signup finalization failed.');
        return;
      }
      setStatus('success');
      setMessage('Signup complete. Redirecting…');
      window.location.href = '/';
    } catch (e: any) {
      setStatus('error');
      setMessage(e?.message || 'Signup finalization failed.');
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Create account</h1>
        <p className="text-sm leading-6 text-foreground/70">
          Set up your profile to track interview practice.
        </p>
      </div>

      <form onSubmit={onSubmit} className="grid gap-4">
        <label className="grid gap-2">
          <span className="text-sm font-medium">Full name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            type="text"
            autoComplete="name"
            className="h-11 rounded-2xl border border-foreground/15 bg-background px-4 text-sm outline-none focus:border-foreground/30"
            placeholder="Your name"
          />
        </label>

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
          <span className="text-sm font-medium">Date of birth</span>
          <input
            value={dob}
            onChange={(e) => setDob(e.target.value)}
            type="date"
            className="h-11 rounded-2xl border border-foreground/15 bg-background px-4 text-sm outline-none focus:border-foreground/30"
            placeholder="YYYY-MM-DD"
          />
        </label>

        <label className="grid gap-2">
          <span className="text-sm font-medium">Phone (optional)</span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            type="tel"
            autoComplete="tel"
            className="h-11 rounded-2xl border border-foreground/15 bg-background px-4 text-sm outline-none focus:border-foreground/30"
            placeholder="+1234567890"
          />
        </label>

        <label className="grid gap-2">
          <span className="text-sm font-medium">Password</span>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete="new-password"
            className="h-11 rounded-2xl border border-foreground/15 bg-background px-4 text-sm outline-none focus:border-foreground/30"
            placeholder="Create a password"
          />
        </label>

        <div id="recaptcha-container" />
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={status === "loading"}
            className="inline-flex h-11 items-center justify-center rounded-full bg-foreground px-5 text-sm font-medium text-background transition-opacity enabled:hover:opacity-90 disabled:opacity-60"
          >
            {status === "loading" ? "Creating…" : "Create account"}
          </button>
          <button
            type="button"
            onClick={completeSignup}
            className="inline-flex h-11 items-center justify-center rounded-full border border-foreground/15 px-5 text-sm font-medium"
          >
            Complete signup
          </button>
        </div>

        <div
          className={
            status === "error"
              ? "text-sm text-foreground"
              : "text-sm text-foreground/70"
          }
          aria-live="polite"
        >
          {message || "Create an account to save interview history."}
        </div>
      </form>

      <div className="text-sm text-foreground/70">
        Already have an account?{" "}
        <a href="/auth/login" className="font-medium text-foreground">
          Sign in
        </a>
        .
      </div>
    </div>
  );
}
