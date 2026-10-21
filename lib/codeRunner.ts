/**
 * Code execution for coding challenges.
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

export function isCodeRunnerConfigured() {
  return Boolean(process.env.CODE_RUNNER_URL);
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
  const url = process.env.CODE_RUNNER_URL;
  if (!url) {
    return {
      ok: false,
      status: 503,
      error: "Code execution is not configured on this server (set CODE_RUNNER_URL to a sandboxed runner).",
    };
  }
  const target = PISTON_LANGUAGE[language];
  try {
    const res = await fetch(url, {
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
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error(`[code-runner] sandbox responded with status ${res.status}`);
      return { ok: false, status: 502, error: "The code runner is unavailable. Please try again." };
    }
    const data = (await res.json()) as {
      compile?: { code?: number | null; stderr?: string; output?: string };
      run?: { stdout?: string; stderr?: string; code?: number | null; signal?: string | null };
    };
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
  } catch (e) {
    console.error("[code-runner] request failed:", e instanceof Error ? e.name : "unknown");
    return { ok: false, status: 502, error: "The code runner did not respond in time. Please try again." };
  }
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
