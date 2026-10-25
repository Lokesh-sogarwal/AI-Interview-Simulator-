This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

## Requirements (Strict)

- Node.js: 22 or 24 LTS recommended (Next.js 16 needs 20.9+)

If you use `nvm`:

```bash
nvm install
nvm use
```

First, run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

If port 3000 is already in use, run:

```bash
npx next dev -p 3002
```

## Production

```bash
npm run build
npm start
```

## Deploy to Vercel

### 1) Environment Variables (Vercel → Project → Settings → Environment Variables)

Required:

- `JWT_SECRET` (long random string)

Required if you want interview history/dashboard persistence:

- `MONGODB_URI`
- `MONGODB_DB`

Optional (AI features; see "AI Provider Configuration"):

- `GROQ_API_KEY` / `GROQ_MODEL` (interview questions)
- `GEMINI_API_KEY` / `GEMINI_MODEL` (evaluation, reports, re-evaluation)
- `OPENROUTER_API_KEY` / `OPENROUTER_MODEL` (free legacy fallback)
- `HUGGINGFACE_API_KEY`
- `HUGGINGFACE_MODEL` (optional; defaults apply)
- `HUGGINGFACE_MODEL_RESUME` / `HUGGINGFACE_MODEL_QUESTION` / `HUGGINGFACE_MODEL_EVAL` (optional)
- `HUGGINGFACE_PROVIDER` (optional)
- `OPENAI_API_KEY` / `OPENAI_MODEL` (optional fallback)

Optional:

- `ALLOW_ANON_INTERVIEWS` (recommend `false` on production)
- `NEXT_PUBLIC_APP_URL` (base URL used in email-verification links)
- `CODE_RUNNER_URL` (required for coding challenges; see below)
- `CODE_RUNNER_TOKEN` (optional `Authorization` header sent to the runner)

### 2) MongoDB Atlas Network Access

If using Atlas, your cluster must allow inbound connections from Vercel builds/runtimes.

- Atlas → Network Access → allow your Vercel IPs, or (for quick testing only) temporarily allow `0.0.0.0/0`.

### 3) Build & Runtime Notes

- This app uses cookie-based auth and server rendering on key routes, so it is deployed as **dynamic** pages on Vercel.
- Never commit `.env.local` (it contains secrets). Use Vercel environment variables instead.

## Coding challenges: sandboxed code runner

User code is **never** executed inside the Next.js server. Running and judging
submissions requires an isolated, [Piston](https://github.com/engineer-man/piston)-compatible
execution service. Without `CODE_RUNNER_URL`, the run/submit endpoints return 503.

**Free demo option (no key):** [Wandbox](https://wandbox.org) works out of the box:

```bash
CODE_RUNNER_URL=https://wandbox.org/api/compile.json
```

Code is sent to wandbox.org (a public, rate-limited service), so use it for demos only. The public Piston
API (emkc.org) is whitelist-only since Feb 2026.

**Production:** self-host Piston:

```bash
# Self-hosted Piston (see the Piston README for installing language runtimes)
docker run -d --privileged -p 2000:2000 ghcr.io/engineer-man/piston
CODE_RUNNER_URL=http://localhost:2000/api/v2/execute
```

Python/JavaScript solutions define `solve(...)` taking the example inputs in order;
C++/Java solutions are full programs that read the example input from stdin.

## Checks

```bash
npm run lint
npm run typecheck
npm test          # Vitest: API, lifecycle, security and UI regression tests
npm run build
```

## Admin and superadmin accounts

Privileged accounts are created by a one-off, idempotent bootstrap script, never by a signup form
and never on ordinary page requests.

```bash
# in .env.local (server-only; never prefix with NEXT_PUBLIC_)
SUPERADMIN_NAME=Platform Super Administrator
SUPERADMIN_EMAIL=superadmin@your-domain.com
SUPERADMIN_PASSWORD=<strong unique secret, 12+ chars>
ADMIN_NAME=Platform Administrator
ADMIN_EMAIL=admin@your-domain.com
ADMIN_PASSWORD=<different strong secret>

npm run provision:admins
```

- Creates missing accounts with bcrypt-hashed passwords and `role: "superadmin" | "admin"`.
- Rerunning is safe: existing provisioned accounts are left unchanged (passwords are never reset).
- If an ordinary account already uses a configured email, it is **not** elevated; the script reports a conflict (exit code 2).
- Prints only email and role, never passwords or hashes. Each creation is written to `audit_logs`.
- Provisioned accounts sign in through the normal login page.

Roles (enforced server-side in `lib/roles.ts`; the role is re-read from the database on every privileged request,
so a downgrade applies immediately even if an older session token is still valid):

| Role | Can |
| --- | --- |
| user | Use the app and their own data only |
| admin | Manage contests; view a minimal user directory (no emails) |
| superadmin | Everything an admin can, plus view emails and change roles (audit-logged; cannot change own role or demote the last superadmin) |

## Conversational interviewer

The live interview is a conversation managed on the server (`/api/interviews/[id]/conversation`):
the candidate's final reply, the conversation so far, the current main question, resume projects and the
remaining budget go to the model, which returns a validated action (acknowledge, clarify, follow up,
next question, close). Each main question is scored when the interviewer moves on, using the whole exchange.

- **Voice mode** uses the browser's Web Speech API for recognition and speech synthesis. This is a
  *sequential* pipeline (speech → text → AI → speech), not a real-time audio model: replies are not streamed,
  and barge-in is via the Interrupt button or typing. Recognition availability depends on the browser
  (best in Chrome/Edge); when unavailable or the mic is blocked, typing is offered automatically.
  Only final transcripts are sent to the server, never raw audio.
- Limits: 6 main questions, up to 3 follow-ups each, 15-minute session (pausing stops the clock).
- `HUGGINGFACE_MODEL_CONVERSATION` (optional) picks the model for conversation turns.
- If the AI provider fails, the candidate's answer is kept and the turn can be retried; scores are never invented.
  Failed evaluations are marked pending and can be retried from the results screen.

## Resume parsing

Uploads are parsed in two stages: deterministic section parsing (handles headings such as
"Personal/Academic/Key Projects", wrapped bullets, link labels, multi-page PDFs), then AI extraction validated
against the text (anything not found in the resume is dropped; projects the AI misses are restored).
Parsed resumes are stored per user in the `resumes` collection and can be reprocessed. Scanned (image-only)
PDFs are rejected with a message; OCR is not bundled.

## AI Provider Configuration

### Groq (questions) + Gemini (evaluation)

Each AI call is tagged with what it is for, and each task has a dedicated provider:

| Task | Provider | Used by |
| --- | --- | --- |
| Question generation | **Groq** (`GROQ_MODEL`, default `llama-3.3-70b-versatile`) | conversational interviewer turns, `/api/next-question`, `/api/ai/question`, `/api/start-interview` |
| Evaluation | **Google Gemini** via `@google/genai` (`GEMINI_MODEL`, default `gemini-3.6-flash`) | per-answer scoring, `/api/ai/evaluate`, `/api/ai/star`, `/api/ai/report`, re-evaluation |

When a dedicated key is set, that provider is used **exclusively** for its task: a failure is reported
(503/502 with the reason) rather than silently retried on another provider. Without the key, the task falls
back to the legacy chain below. Resume parsing and coding problems always use the legacy chain.

```bash
# .env.local (and the same names in Vercel → Settings → Environment Variables, Production + Preview)
GROQ_API_KEY=gsk_...
GROQ_MODEL=llama-3.3-70b-versatile
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-3.6-flash
```

- Gemini replies are constrained with JSON Schemas (`lib/aiSchemas.ts`) and validated again on the server:
  every score must be a number from 0 to 10, and incomplete replies are rejected (never filled with zeros).
- Re-evaluation scores all answers in batched Gemini calls (6 answers per call), so a typical run is two
  requests: answers + report.
- Opening a saved report reads MongoDB only; no AI provider is called.
- Free tiers: Gemini free-tier limits are per Google Cloud project and shown on the rate-limit
  page in Google AI Studio; daily quotas reset at midnight Pacific. On the free tier Google may
  use prompts (the candidate's answers) to improve its products. Groq free-plan limits are shown on the limits
  page of your Groq console settings. When a limit is hit, users see that reason, not a generic error.

### Video interview: voice, timer and transcription

Interviews are video calls only (the typing mode was removed; old typed interviews still open in history).

- **Interviewer voice**: the browser's speech synthesis reads each question. No server cost.
- **Candidate speech** (two paths, picked automatically):
  - **Live captions** in browsers with the Web Speech API (Chrome, Edge, Safari). The browser does the
    recognition; Chrome and Safari may send the audio to Google/Apple for this. No server cost.
  - **Server transcription** where that API is missing (e.g. Firefox): each answer is recorded in memory
    (`MediaRecorder`), sent once to `POST /api/interviews/[id]/transcribe`, transcribed with Groq Whisper
    (`GROQ_STT_MODEL`, default `whisper-large-v3-turbo`) and discarded; only the text is saved. Groq lists it at
    $0.04 per audio hour, billed at a minimum of 10 s per request, with a 25 MB file limit on the free tier.
    Without `GROQ_API_KEY` these browsers see a clear "not configured" message.
- **Video** is shown only locally (lobby preview and picture-in-picture). It is never recorded or uploaded;
  the camera is used only for the existing on-device face-presence check.
- **60-second answer timer** starts after the question has been read aloud and pauses while an answer is
  being saved or transcribed. At zero, recognition is stopped and its last words collected (or the recording
  is transcribed), then the answer is saved with `timedOut: true` (an empty answer is stored as
  "No answer: time ran out"). The interview only moves on after the save succeeds.
- **AI calls per question** are bounded: one Groq call per interviewer turn (at most two attempts, at most
  three follow-ups per question), one Gemini evaluation when the question closes, and one Gemini report at
  the end. Timer ticks, voice playback, page refreshes and opening a saved report make no AI calls.

### Reports and the one re-evaluation

- `POST /api/ai/report` generates the report once and stores it; later calls return the stored report
  without an AI call. It is not generated while any answer still awaits evaluation.
- `POST /api/interviews/[id]/reevaluate` allows **one successful re-evaluation** per interview, enforced in
  MongoDB (`reevaluationsUsed`). States: *available* → *running* (atomic reservation:
  `reevaluationsUsed < 1` and no live `reevaluation` lock) → *used* (the new evaluations, report and
  `$inc reevaluationsUsed` are one atomic write). A failed run releases the reservation and records
  `reevaluationStatus: "failed"` without consuming the allowance; a crashed run's lock expires after 2 minutes.
  Concurrent requests get 409; after success every request gets 409 `reevaluation_limit_reached`.
  No migration is needed: missing fields mean "not used yet".

### Proctoring (integrity monitoring)

Disclosed in the lobby (the candidate must agree before starting). Observations only: proctoring **never
ends an interview, changes scores, or calls an AI model**, and nothing it records is sent to Groq or Gemini.

**What is detected** (`app/interview/useProctoring.ts`, policy in `lib/proctoring.ts`):

| Event | How | Severity (computed on the server) |
| --- | --- | --- |
| `tab_hidden` | Page Visibility API, with duration | info < 5 s, warning < 30 s, review ≥ 30 s |
| `window_blur` | blur/focus, only if ≥ 2 s and the tab stayed visible (weak signal) | info |
| `fullscreen_exit` | `fullscreenchange`, only after fullscreen was entered (requested on Start) | warning |
| `camera_lost` / `mic_lost` | track `ended` / permission denied, with recovery time | info; warning if ≥ 30 s or never recovered |
| `camera_turned_off` | the candidate's own camera button | info |
| `face_not_detected` | on-device detector (browser FaceDetector or MediaPipe), every 2 s, after 10 s without a face | warning; review ≥ 60 s |
| `multiple_faces` | 2+ faces on 3 consecutive checks | review |
| `silence_during_answer` | on-device mic level, 20 s of silence while answering with a live, unmuted mic | info |
| `speech_recognition_error`, `transcription_failed` | speech pipeline errors | info |
| `session_started` / `_reconnected` / `_interrupted` / `_ended` | server: session route and finish | info (interrupted: warning) |
| `pause_used`, `concurrent_request_rejected` | server: conversation route | info |

Each type has a 5 s cooldown. Isolated face misses (movement, lighting) are ignored. The summary
recommends a human review (never a verdict) for: a tab hidden ≥ 30 s at once, ≥ 3 tab hides of ≥ 5 s,
sustained multiple faces, no face ≥ 60 s at once, or ≥ 3 fullscreen exits. A disconnected microphone pauses
the answer timer (technical interruption); hiding the tab or muting yourself does not.

**Not detectable**: second devices, people or notes off camera, other screens, or a remote helper. Face checks
don't identify anyone and no emotion, honesty or voice analysis is done.

**Data** (no media is stored or uploaded):
- `proctoring_sessions`: `{ _id (server uuid), interviewId, userId, startedAt, endedAt, endReason, maxSeq, eventCount, previousSessionId }`
- `proctoring_events`: `{ interviewId, userId, sessionId, clientEventId, seq, type, category, kind, severity, source, clientAt, receivedAt, durationMs, resolved, warned, meta, flags }`
  (`meta` only allows a few short codes/integers; `flags` marks out-of-order, sequence gaps and clock skew).
- Indexes: unique `{sessionId, clientEventId}` (idempotency), `{interviewId, receivedAt}`, `{interviewId, startedAt}`,
  and TTL indexes deleting events and sessions after **180 days**. The aggregated `proctoringSummary` (counts
  and durations, plus the candidate's optional note) is stored on the interview and kept with the report.
- Deletion: `DELETE /api/interviews/[id]/proctoring` (administrators only, audit-logged).

**API** (all authenticated, owner-only):
- `POST /api/interviews/[id]/proctoring/session` starts a session; an earlier open session is marked interrupted.
  Rejected for finished interviews.
- `POST /api/interviews/[id]/proctoring/events` `{ sessionId, events: [...] }`, at most 25 events and 16 KB per
  request, 1000 per session, 120 requests / 10 min per session. Unknown or server-only types are rejected and
  severity, receipt time and owner are set by the server. Retries are idempotent.
- `POST /api/interviews/[id]/proctoring/note` adds the candidate's explanation (plain text, ≤ 1000 chars).
- The finish route closes sessions and stores the summary from stored events; any proctoring numbers sent by
  the browser are ignored.

**Delivery**: events are queued in memory and `localStorage`, sent every ~2 s, retried with backoff (5 → 60 s)
on network/5xx/429, flushed with `keepalive` on page hide, and flushed before finishing. After a reload, leftover
events are sent under their original session id. Rate limits are in-process (per server instance).

### Legacy chain

Providers are tried in order, each only when its key is set: **OpenRouter → Hugging Face → OpenAI**.

**Free option: OpenRouter.** Create a key at https://openrouter.ai/keys (no card needed) and set:

```bash
OPENROUTER_API_KEY=sk-or-...
# optional; defaults to these free models (the 2nd and 3rd are automatic fallbacks)
OPENROUTER_MODEL=minimax/minimax-m3.1-flash:free,nvidia/nemotron-3.5-super-vl:free,google/gemma-4-31b-it:free
```

Free models are rate-limited by OpenRouter (about 20 requests/minute, plus a daily request cap that is
higher once the account has bought credits). When a limit is hit, the app says so instead of failing silently.
The free catalogue changes; check https://openrouter.ai/models?q=free and update `OPENROUTER_MODEL` if a
model disappears.

This app can generate interview questions and end-of-interview feedback using an LLM.

- **Preferred (Hugging Face Inference API)**: set `HUGGINGFACE_API_KEY`.
- **Fallback (OpenAI)**: set `OPENAI_API_KEY`.

If both are set, the app will **prefer Hugging Face**, falling back to OpenAI when a Hugging Face call fails.

Hugging Face Inference Providers are billed per request. If the account runs out of credits (HTTP 402),
every AI feature reports "the AI provider account has run out of credits"; top up credits, subscribe to PRO,
or configure `OPENAI_API_KEY`. Resume parsing still works with the rule-based parser in that case.

Add to `.env.local`:

```bash
# Hugging Face (recommended)
HUGGINGFACE_API_KEY=your_hf_token
# Optional: choose a chat/instruct model hosted on Hugging Face
HUGGINGFACE_MODEL=mistralai/Mistral-7B-Instruct-v0.3

# OpenAI (optional fallback)
OPENAI_API_KEY=your_openai_key
OPENAI_MODEL=gpt-4.1-mini
```

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

