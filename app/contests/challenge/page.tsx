"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Clock, Play, Send } from "lucide-react";

import { CodeEditor } from "@/app/components/CodeEditor";
import { TestCaseChecker, type TestCase } from "@/app/components/TestCaseChecker";
import { Alert, Badge, Button, ButtonLink, Card, CardBody, CardHeader, EmptyState, LoadingState, Select, Tabs } from "@/app/components/ui";
import { parseExampleInput, type SupportedLanguage } from "@/lib/codeRunner";
import { postJson } from "@/app/lib/useApi";

type Problem = {
  title: string;
  description: string;
  difficulty: string;
  constraints: string;
  examples: Array<{ input: string; output: string; explanation?: string }>;
  topics: string[];
};

const LANGUAGES: Array<{ value: SupportedLanguage; label: string }> = [
  { value: "python", label: "Python" },
  { value: "javascript", label: "JavaScript" },
  { value: "cpp", label: "C++" },
  { value: "java", label: "Java" },
];

/** Starter code that matches how the judge calls the solution (see lib/codeRunner). */
function starterCode(language: SupportedLanguage, problem: Problem | null) {
  const names = (problem?.examples[0] && parseExampleInput(problem.examples[0].input)?.names) || ["input"];
  const args = names.join(", ");
  switch (language) {
    case "python":
      return `def solve(${args}):\n    # Return the answer; it is printed as JSON and compared with the expected output.\n    pass\n`;
    case "javascript":
      return `function solve(${args}) {\n  // Return the answer; it is printed as JSON and compared with the expected output.\n}\n`;
    case "cpp":
      return `#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    // The example input (e.g. "${problem?.examples[0]?.input ?? ""}") is given on stdin.\n    string line;\n    getline(cin, line);\n    // Parse it, solve, and print the answer exactly as in the expected output.\n    return 0;\n}\n`;
    case "java":
      return `import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        // The example input is given on stdin as a single line.\n        Scanner sc = new Scanner(System.in);\n        String line = sc.hasNextLine() ? sc.nextLine() : "";\n        // Parse it, solve, and print the answer exactly as in the expected output.\n    }\n}\n`;
  }
}

function difficultyTone(d: string) {
  return d === "Easy" ? "success" : d === "Medium" ? "warning" : d === "Hard" ? "error" : "neutral";
}

function useCountdown(endIso: string | null) {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!endIso) return;
    const end = Date.parse(endIso);
    const tick = () => setLeft(Math.max(0, Math.floor((end - Date.now()) / 1000)));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [endIso]);
  return left;
}

function formatLeft(s: number) {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h`;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function ChallengeWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const contestId = searchParams.get("contestId");
  const problemIndex = Number.parseInt(searchParams.get("problemIndex") || "0", 10);

  const [problem, setProblem] = useState<Problem | null>(null);
  const [meta, setMeta] = useState<{ total: number; endDate: string | null; phase: string } | null>(null);
  const [language, setLanguage] = useState<SupportedLanguage>("python");
  const [code, setCode] = useState("");
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ tone: "success" | "error" | "warning"; text: string } | null>(null);
  const [mobilePane, setMobilePane] = useState<"problem" | "code">("problem");

  const draftKey = contestId ? `aisim_code_${contestId}_${problemIndex}_${language}` : "";
  const secondsLeft = useCountdown(meta?.endDate ?? null);
  const ended = meta?.phase === "ended" || secondsLeft === 0;

  useEffect(() => {
    if (!contestId) {
      router.replace("/contests");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    (async () => {
      try {
        const res = await fetch(`/api/contests/${encodeURIComponent(contestId)}/problems?index=${problemIndex}`);
        const data = (await res.json().catch(() => null)) as { ok: boolean; error?: string; problem?: Problem; totalProblems?: number; endDate?: string | null; phase?: string } | null;
        if (cancelled) return;
        if (!res.ok || !data?.ok || !data.problem) {
          setLoadError(data?.error || "This problem could not be loaded.");
          return;
        }
        setProblem(data.problem);
        setMeta({ total: data.totalProblems ?? 1, endDate: data.endDate ?? null, phase: data.phase ?? "active" });
        setTestCases(data.problem.examples.map((ex) => ({ input: ex.input, output: ex.output })));
        setResult(null);
      } catch {
        if (!cancelled) setLoadError("Could not reach the server.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contestId, problemIndex, router]);

  // Restore a draft for this problem/language, or the starter template.
  useEffect(() => {
    if (!problem) return;
    let saved: string | null = null;
    try {
      saved = draftKey ? window.localStorage.getItem(draftKey) : null;
    } catch {
      saved = null;
    }
    setCode(saved ?? starterCode(language, problem));
    setTestCases(problem.examples.map((ex) => ({ input: ex.input, output: ex.output })));
  }, [problem, language, draftKey]);

  useEffect(() => {
    if (!draftKey || !code) return;
    const id = window.setTimeout(() => {
      try {
        window.localStorage.setItem(draftKey, code);
      } catch {
        // Drafts are a convenience only.
      }
    }, 400);
    return () => window.clearTimeout(id);
  }, [code, draftKey]);

  async function runExamples() {
    if (!code.trim() || !problem) return;
    setRunning(true);
    setResult(null);
    const out: TestCase[] = [];
    for (const tc of problem.examples) {
      try {
        const res = await postJson<{ output?: string; error?: string; passed?: boolean }>("/api/code-execute", { code, language, input: tc.input, expectedOutput: tc.output });
        if (!res.ok) {
          setResult({ tone: "error", text: res.data?.error || "The code runner is unavailable." });
          setRunning(false);
          return;
        }
        out.push({ input: tc.input, output: tc.output, actual: res.data?.output ?? "", error: res.data?.error, passed: Boolean(res.data?.passed) });
      } catch {
        setResult({ tone: "error", text: "Could not reach the code runner." });
        setRunning(false);
        return;
      }
    }
    setTestCases(out);
    setRunning(false);
  }

  async function submit() {
    if (!code.trim() || !contestId) return;
    setSubmitting(true);
    setResult(null);
    try {
      const res = await postJson<{ passed: boolean; passedCount: number; totalCount: number; score: number; message: string; results?: TestCase[] }>("/api/contests/submissions", {
        contestId,
        problemIndex,
        code,
        language,
      });
      if (!res.ok || !res.data) {
        setResult({ tone: "error", text: res.data?.error || "Submission failed." });
      } else {
        const d = res.data;
        if (Array.isArray(d.results) && d.results.length) setTestCases(d.results.map((r) => ({ ...r, output: (r as unknown as { expected?: string }).expected ?? r.output })));
        setResult({
          tone: d.passed ? "success" : "warning",
          text: `${d.message} ${d.passedCount}/${d.totalCount} tests passed. Contest score: ${d.score}%.`,
        });
      }
    } catch {
      setResult({ tone: "error", text: "Could not reach the server." });
    } finally {
      setSubmitting(false);
    }
  }

  const nav = useMemo(() => {
    if (!meta || !contestId) return null;
    const href = (i: number) => `/contests/challenge?contestId=${encodeURIComponent(contestId)}&problemIndex=${i}`;
    return { prev: problemIndex > 0 ? href(problemIndex - 1) : null, next: problemIndex < meta.total - 1 ? href(problemIndex + 1) : null };
  }, [meta, contestId, problemIndex]);

  if (loading) return <div className="p-6"><LoadingState label="Loading problem…" /></div>;
  if (loadError || !problem) {
    return (
      <div className="mx-auto max-w-xl p-6">
        <EmptyState title={loadError || "Problem not found"} action={<ButtonLink href={contestId ? `/contests/${contestId}` : "/contests"}>Back to contest</ButtonLink>} />
      </div>
    );
  }

  const compiled = language === "cpp" || language === "java";

  return (
    <div className="flex min-h-[calc(100dvh-3.5rem)] flex-col lg:h-dvh lg:min-h-0">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <ButtonLink href={`/contests/${contestId}`} variant="ghost" size="sm" icon={<ChevronLeft className="size-4" aria-hidden />}>
            Contest
          </ButtonLink>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold text-text">
              {problemIndex + 1}. {problem.title}
            </h1>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
              <Badge tone={difficultyTone(problem.difficulty)}>{problem.difficulty}</Badge>
              {problem.topics.slice(0, 3).map((t) => (
                <Badge key={t}>{t}</Badge>
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {secondsLeft !== null ? (
            <Badge tone={ended ? "error" : secondsLeft < 600 ? "warning" : "neutral"} icon={<Clock className="size-3" aria-hidden />}>
              {ended ? "Contest ended" : `${formatLeft(secondsLeft)} left`}
            </Badge>
          ) : null}
          {nav?.prev ? (
            <ButtonLink href={nav.prev} variant="secondary" size="sm" aria-label="Previous problem" icon={<ChevronLeft className="size-4" aria-hidden />}>
              <span className="sr-only sm:not-sr-only">Prev</span>
            </ButtonLink>
          ) : null}
          {nav?.next ? (
            <ButtonLink href={nav.next} variant="secondary" size="sm" aria-label="Next problem" className="flex-row-reverse" icon={<ChevronRight className="size-4" aria-hidden />}>
              <span className="sr-only sm:not-sr-only">Next</span>
            </ButtonLink>
          ) : null}
        </div>
      </header>

      <div className="border-b border-border bg-surface px-4 py-2 lg:hidden">
        <Tabs label="Workspace pane" value={mobilePane} onChange={setMobilePane} tabs={[{ value: "problem", label: "Problem" }, { value: "code", label: "Code" }]} />
      </div>

      <div className="grid min-h-0 flex-1 lg:grid-cols-2">
        <section aria-label="Problem statement" className={`min-h-0 overflow-y-auto border-r border-border p-4 sm:p-6 ${mobilePane === "problem" ? "block" : "hidden"} lg:block`}>
          <div className="grid gap-6">
            <div>
              <h2 className="text-sm font-semibold text-text">Description</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-text">{problem.description}</p>
            </div>
            {problem.constraints ? (
              <div>
                <h2 className="text-sm font-semibold text-text">Constraints</h2>
                <p className="mt-2 whitespace-pre-wrap rounded-control bg-surface-muted p-3 font-mono text-xs text-text">{problem.constraints}</p>
              </div>
            ) : null}
            <div>
              <h2 className="text-sm font-semibold text-text">Examples</h2>
              <ol className="mt-2 grid gap-3">
                {problem.examples.map((ex, i) => (
                  <li key={i} className="rounded-control border border-border p-3 text-xs">
                    <p className="font-semibold text-text">Example {i + 1}</p>
                    <p className="mt-1.5 font-mono text-text">
                      <span className="font-sans text-muted">Input: </span>
                      {ex.input}
                    </p>
                    <p className="font-mono text-text">
                      <span className="font-sans text-muted">Output: </span>
                      {ex.output}
                    </p>
                    {ex.explanation ? <p className="mt-1 text-muted">{ex.explanation}</p> : null}
                  </li>
                ))}
              </ol>
            </div>
            <Card>
              <CardHeader title="Test results" as="h2" />
              <CardBody>
                <TestCaseChecker testCases={testCases} isRunning={running} />
              </CardBody>
            </Card>
          </div>
        </section>

        <section aria-label="Code editor" className={`flex min-h-[28rem] flex-col ${mobilePane === "code" ? "flex" : "hidden"} lg:flex`}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface px-4 py-2.5">
            <div className="flex items-center gap-2">
              <label htmlFor="language" className="text-sm font-medium text-text">
                Language
              </label>
              <Select id="language" value={language} onChange={(e) => setLanguage(e.target.value as SupportedLanguage)} className="h-9 w-36">
                {LANGUAGES.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </Select>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setCode(starterCode(language, problem));
                setTestCases(problem.examples.map((ex) => ({ input: ex.input, output: ex.output })));
              }}
            >
              Reset code
            </Button>
          </div>
          <p className="border-b border-border bg-surface-muted px-4 py-2 text-xs text-muted">
            {compiled
              ? "C++/Java: write a full program. Each example's input is sent on stdin; print the answer exactly as shown."
              : "Define solve(...) taking the example's inputs in order and return the answer. It is compared with the expected output."}
          </p>
          <CodeEditor language={language} value={code} onChange={setCode} label={`${LANGUAGES.find((l) => l.value === language)?.label} solution`} className="min-h-0 flex-1 overflow-hidden" />
          <div className="grid gap-2 border-t border-border bg-surface p-3">
            {result ? <Alert tone={result.tone}>{result.text}</Alert> : null}
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={runExamples} loading={running} disabled={submitting || !code.trim()} icon={<Play className="size-4" aria-hidden />}>
                Run examples
              </Button>
              <Button onClick={submit} loading={submitting} disabled={running || !code.trim() || ended} icon={<Send className="size-4" aria-hidden />}>
                {ended ? "Submissions closed" : "Submit"}
              </Button>
            </div>
            <p className="text-right text-xs text-muted">
              Submissions are judged on the server against all test cases.{" "}
              <Link href={`/contests/${contestId}`} className="underline underline-offset-2 hover:text-text">
                View leaderboard
              </Link>
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

export default function ContestChallengePage() {
  return (
    <Suspense fallback={<div className="p-6"><LoadingState label="Loading…" /></div>}>
      <ChallengeWorkspace />
    </Suspense>
  );
}
