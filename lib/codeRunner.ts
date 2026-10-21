/**
 * Code execution for coding challenges.
 *
 * Supported sandboxes (chosen from CODE_RUNNER_URL):
 * - Piston-compatible, e.g. a self-hosted `http://localhost:2000/api/v2/execute`.
 * - Wandbox (https://wandbox.org/api/compile.json): free, no key. Good for
 *   demos; code is sent to a third-party service and is subject to its
 *   fair-use limits, so self-host Piston for production.
 *
 * User code is NEVER executed inside the Next.js process or through a local
 * shell. It is sent to an isolated, Piston-compatible sandbox service
 * (https://github.com/engineer-man/piston) configured with CODE_RUNNER_URL,
 * e.g. `http://localhost:2000/api/v2/execute` for a self-hosted instance.
 *
 * Execution model:
 * - python / javascript: write a function (preferably `solve`) that takes the
 *   example's named inputs as arguments, in order, and returns the answer.
 *   The harness parses `nums = [2,7], target = 9` into JSON arguments.
 * - cpp / java: write a full program that reads the raw example input from
 *   stdin and prints the answer.
 */

export const SUPPORTED_LANGUAGES = ["python", "javascript", "cpp", "java"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const MAX_CODE_BYTES = 50 * 1024;
const MAX_OUTPUT_CHARS = 10_000;
const RUN_TIMEOUT_MS = 5_000;
const REQUEST_TIMEOUT_MS = 20_000;

const PISTON_LANGUAGE: Record<SupportedLanguage, { language: string; file: string }> = {
  python: { language: "python", file: "main.py" },
  javascript: { language: "javascript", file: "main.js" },
  cpp: { language: "c++", file: "main.cpp" },
  java: { language: "java", file: "Main.java" },
};

export function isSupportedLanguage(value: unknown): value is SupportedLanguage {
  return SUPPORTED_LANGUAGES.includes(value as SupportedLanguage);
}

const WANDBOX_COMPILER: Record<SupportedLanguage, string> = {
  python: "cpython-3.12.7",
  javascript: "nodejs-20.17.0",
  cpp: "gcc-13.2.0",
  java: "openjdk-jdk-22+36",
};

export function runnerKind(url = process.env.CODE_RUNNER_URL || "") {
  return /wandbox\.org/i.test(url) ? ("wandbox" as const) : ("piston" as const);
}

/** Wandbox compiles Java as prog.java, so a public Main class must lose its `public`. */
export function wandboxSource(language: SupportedLanguage, source: string) {
  return language === "java" ? source.replace(/\bpublic\s+((?:final\s+)?class\s+Main\b)/, "$1") : source;
}

async function runInWandbox(url: string, language: SupportedLanguage, source: string, stdin: string): Promise<RunResult> {
  const { res, error } = await postWithRetry(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "ai-interview-simulator/1.0" },
    body: JSON.stringify({
      compiler: process.env[`CODE_RUNNER_WANDBOX_${language.toUpperCase()}`] || WANDBOX_COMPILER[language],
      code: wandboxSource(language, source),
      stdin,
      ...(language === "cpp" ? { options: "c++17" } : {}),
      save: false,
    }),
  });
  if (!res || !res.ok) return upstreamFailure(url, res, error);
  const d = (await res.json().catch(() => null)) as { status?: string; signal?: string; compiler_error?: string; program_output?: string; program_error?: string } | null;
  if (!d) return { ok: false, status: 502, error: "The code runner returned an unreadable response. Please try again." };
  const exit = d.status === undefined || d.status === "" ? null : Number(d.status);
  const compileFailed = Boolean(d.compiler_error) && !d.program_output && exit !== 0;
  return {
    ok: true,
    stdout: compileFailed ? "" : String(d.program_output ?? "").slice(0, MAX_OUTPUT_CHARS),
    stderr: String((compileFailed ? d.compiler_error : d.program_error) ?? "").slice(0, MAX_OUTPUT_CHARS),
    exitCode: Number.isFinite(exit) ? exit : compileFailed ? 1 : null,
    timedOut: /kill|xcpu|time/i.test(d.signal ?? ""),
  };
}

/** CODE_RUNNER_URL, trimmed and without stray quotes (common when pasted into a hosting dashboard). */
export function codeRunnerUrl() {
  return (process.env.CODE_RUNNER_URL || "").trim().replace(/^["']|["']$/g, "").trim();
}

export function isCodeRunnerConfigured() {
  return Boolean(codeRunnerUrl());
}

function hostOf(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return "the configured code runner";
  }
}

/** POST with one retry on transient failures (network errors, 429, 5xx). */
async function postWithRetry(url: string, init: RequestInit): Promise<{ res: Response | null; error: string | null }> {
  let lastError: string | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if ((res.status === 429 || res.status >= 500) && attempt === 0) {
        lastError = `HTTP ${res.status}`;
        await new Promise((r) => setTimeout(r, 800));
        continue;
      }
      return { res, error: null };
    } catch (e) {
      lastError = e instanceof Error ? `${e.name}: ${e.message}` : "network error";
      if (attempt === 0) await new Promise((r) => setTimeout(r, 800));
    }
  }
  return { res: null, error: lastError };
}

async function upstreamFailure(url: string, res: Response | null, error: string | null): Promise<RunResult> {
  const host = hostOf(url);
  if (!res) {
    console.error(`[code-runner] ${host} unreachable:`, error);
    const timedOut = /timeout|abort/i.test(error ?? "");
    return { ok: false, status: 502, error: timedOut ? `The code runner (${host}) did not respond in time. Please try again.` : `Could not reach the code runner (${host}). Check CODE_RUNNER_URL on the server.` };
  }
  const body = (await res.text().catch(() => "")).slice(0, 300);
  console.error(`[code-runner] ${host} responded with HTTP ${res.status}:`, body);
  const hint = res.status === 401 || res.status === 403 ? " It rejected the request (access denied); the service may block this server or need a token." : res.status === 429 ? " It is rate-limiting requests; try again shortly." : "";
  return { ok: false, status: 502, error: `The code runner (${host}) returned HTTP ${res.status}.${hint}` };
}

/** Splits on commas that are not nested inside brackets or quotes. */
function splitTopLevel(input: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let current = "";
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (quote) {
      current += ch;
      if (ch === "\\") {
        current += input[i + 1] ?? "";
        i += 1;
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "[" || ch === "{" || ch === "(") depth += 1;
    else if (ch === "]" || ch === "}" || ch === ")") depth -= 1;
    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current);
  return parts;
}

function parseLiteral(raw: string): unknown {
  const value = raw.trim();
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1);
  if (value === "True" || value === "False") return value === "True";
  if (value === "None" || value === "null") return null;
  return JSON.parse(value);
}

/**
 * Parses LeetCode-style example input (`nums = [2,7,11,15], target = 9`) into
 * argument names and JSON values. Returns null when the input is not in that form.
 */
export function parseExampleInput(input: string): { names: string[]; args: unknown[] } | null {
  const text = input.trim();
  if (!text) return null;
  const names: string[] = [];
  const args: unknown[] = [];
  for (const part of splitTopLevel(text)) {
    const match = part.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([\s\S]+)$/);
    if (!match) return null;
    try {
      args.push(parseLiteral(match[2]));
      names.push(match[1]);
    } catch {
      return null;
    }
  }
  return names.length ? { names, args } : null;
}

export function findEntryFunction(code: string, language: "python" | "javascript"): string | null {
  if (language === "python") {
    if (/^def\s+solve\s*\(/m.test(code)) return "solve";
    const top = code.match(/^def\s+([A-Za-z_]\w*)\s*\(/m);
    if (top) return top[1];
    const method = code.match(/^\s+def\s+((?!__)[A-Za-z_]\w*)\s*\(\s*self/m);
    return method && /^class\s+Solution\b/m.test(code) ? `Solution().${method[1]}` : null;
  }
  if (/\bfunction\s+solve\s*\(|\b(?:const|let|var)\s+solve\s*=/.test(code)) return "solve";
  const fn = code.match(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/);
  if (fn) return fn[1];
  const assigned = code.match(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/);
  return assigned ? assigned[1] : null;
}

export function buildProgram(
  code: string,
  language: SupportedLanguage,
  exampleInput: string,
): { source: string; stdin: string } | { error: string } {
  if (language === "cpp" || language === "java") {
    return { source: code, stdin: exampleInput };
  }

  const parsed = parseExampleInput(exampleInput);
  if (!parsed) return { error: "This example's input is not in `name = value` form; use C++ or Java (stdin) for it." };
  const entry = findEntryFunction(code, language);
  if (!entry) {
    return { error: language === "python" ? "Define a function, e.g. `def solve(...)`." : "Define a function, e.g. `function solve(...)`." };
  }
  const stdin = JSON.stringify(parsed.args);

  if (language === "python") {
    return {
      stdin,
      source: `${code}\n\nimport json as __json, sys as __sys\n__args = __json.loads(__sys.stdin.read())\nprint(__json.dumps(${entry}(*__args), separators=(",", ":")))\n`,
    };
  }
  return {
    stdin,
    source: `${code}\n\nconst __args = JSON.parse(require("fs").readFileSync(0, "utf8"));\nPromise.resolve(${entry}(...__args)).then((r) => console.log(JSON.stringify(r === undefined ? null : r)));\n`,
  };
}

function canonical(text: string): string {
  const trimmed = text.trim();
  try {
    return JSON.stringify(parseLiteral(trimmed));
  } catch {
    return trimmed.replace(/\s+/g, " ");
  }
}

/** Compares outputs structurally when both sides are JSON-like, else by whitespace-normalised text. */
export function outputsMatch(actual: string, expected: string) {
  return canonical(actual) === canonical(expected);
}

export type RunResult =
  | { ok: true; stdout: string; stderr: string; exitCode: number | null; timedOut: boolean }
  | { ok: false; error: string; status: number };

export async function runInSandbox(language: SupportedLanguage, source: string, stdin: string): Promise<RunResult> {
  const url = codeRunnerUrl();
  if (!url) {
    return {
      ok: false,
      status: 503,
      error: "Code execution is not configured on this server (set CODE_RUNNER_URL to a sandboxed runner).",
    };
  }
  if (runnerKind(url) === "wandbox") return runInWandbox(url, language, source, stdin);
  const target = PISTON_LANGUAGE[language];
  const { res, error } = await postWithRetry(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.CODE_RUNNER_TOKEN ? { Authorization: process.env.CODE_RUNNER_TOKEN } : {}),
    },
    body: JSON.stringify({
      language: target.language,
      version: "*",
      files: [{ name: target.file, content: source }],
      stdin,
      run_timeout: RUN_TIMEOUT_MS,
      compile_timeout: 10_000,
      run_memory_limit: 256 * 1024 * 1024,
    }),
  });
  if (!res || !res.ok) return upstreamFailure(url, res, error);
  const data = (await res.json().catch(() => null)) as {
    compile?: { code?: number | null; stderr?: string; output?: string };
    run?: { stdout?: string; stderr?: string; code?: number | null; signal?: string | null };
  } | null;
  if (!data) return { ok: false, status: 502, error: "The code runner returned an unreadable response. Please try again." };
  if (data.compile && data.compile.code) {
    return {
      ok: true,
      stdout: "",
      stderr: String(data.compile.stderr || data.compile.output || "Compilation failed").slice(0, MAX_OUTPUT_CHARS),
      exitCode: data.compile.code ?? 1,
      timedOut: false,
    };
  }
  return {
    ok: true,
    stdout: String(data.run?.stdout ?? "").slice(0, MAX_OUTPUT_CHARS),
    stderr: String(data.run?.stderr ?? "").slice(0, MAX_OUTPUT_CHARS),
    exitCode: data.run?.code ?? null,
    timedOut: data.run?.signal === "SIGKILL",
  };
}

export type TestOutcome = { input: string; expected: string; actual: string; passed: boolean; error?: string };

export async function runTestCase(
  code: string,
  language: SupportedLanguage,
  test: { input: string; output: string },
): Promise<TestOutcome | { fatal: string; status: number }> {
  const program = buildProgram(code, language, test.input);
  if ("error" in program) {
    return { input: test.input, expected: test.output, actual: "", passed: false, error: program.error };
  }
  const result = await runInSandbox(language, program.source, program.stdin);
  if (!result.ok) return { fatal: result.error, status: result.status };
  const actual = result.stdout.trim();
  const error = result.timedOut
    ? `Time limit exceeded (${RUN_TIMEOUT_MS / 1000}s)`
    : result.exitCode && result.exitCode !== 0
      ? result.stderr.trim() || `Exited with code ${result.exitCode}`
      : undefined;
  return {
    input: test.input,
    expected: test.output,
    actual,
    passed: !error && outputsMatch(actual, test.output),
    ...(error ? { error } : {}),
  };
}
