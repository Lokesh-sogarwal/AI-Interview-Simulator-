"use client";

import { useState } from "react";

export default function SignOutButton() {
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        try {
          setBusy(true);
          await fetch("/api/auth/logout", { method: "POST" });
        } finally {
          window.location.href = "/";
        }
      }}
      className="inline-flex h-10 items-center justify-center rounded-full border border-foreground/15 px-4 text-sm font-medium transition-opacity enabled:hover:opacity-90 disabled:opacity-60"
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
