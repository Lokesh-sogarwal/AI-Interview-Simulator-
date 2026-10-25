"use client";

import { useState } from "react";

import { Alert, Button, Textarea } from "@/app/components/ui";

/** Lets the candidate explain technical issues next to their integrity summary. */
export default function ProctoringNoteForm({ interviewId, initialNote }: { interviewId: string; initialNote: string }) {
  const [note, setNote] = useState(initialNote);
  const [saved, setSaved] = useState(initialNote);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/interviews/${interviewId}/proctoring/note`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note }) }).catch(() => null);
    const data = res ? ((await res.json().catch(() => null)) as { ok?: boolean; note?: string; error?: string } | null) : null;
    if (res?.ok && data?.ok) setSaved(data.note ?? note);
    else setError(data?.error || "Your note couldn't be saved. Please try again.");
    setBusy(false);
  }

  return (
    <div className="grid gap-2">
      <label htmlFor="proctoring-note" className="text-sm font-semibold text-text">
        Add context for reviewers (optional)
      </label>
      <Textarea id="proctoring-note" rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: my headset disconnected at question 3." />
      <div className="flex items-center gap-3">
        <Button size="sm" variant="secondary" onClick={save} loading={busy} disabled={!note.trim() || note.trim() === saved.trim()}>
          Save note
        </Button>
        {saved && saved.trim() === note.trim() ? <span className="text-xs text-muted">Saved</span> : null}
      </div>
      {error ? <Alert tone="error">{error}</Alert> : null}
    </div>
  );
}
