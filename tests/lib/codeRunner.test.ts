import { afterEach, describe, expect, it, vi } from "vitest";

import { buildProgram, findEntryFunction, outputsMatch, parseExampleInput, runTestCase, runnerKind, wandboxSource } from "@/lib/codeRunner";

describe("example input parsing", () => {
  it("parses named JSON arguments", () => {
    expect(parseExampleInput("nums = [2,7,11,15], target = 9")).toEqual({ names: ["nums", "target"], args: [[2, 7, 11, 15], 9] });
    expect(parseExampleInput('s = "a,b"')).toEqual({ names: ["s"], args: ["a,b"] });
    expect(parseExampleInput("lists = [[1,4,5],[1,3,4]]")?.args).toEqual([[[1, 4, 5], [1, 3, 4]]]);
  });

  it("returns null for free-form input", () => {
    expect(parseExampleInput("5\n1 2 3 4 5")).toBeNull();
    expect(parseExampleInput("")).toBeNull();
  });
});

describe("harness", () => {
  it("prefers a solve() entry point and otherwise the first function", () => {
    expect(findEntryFunction("def helper():\n  pass\ndef solve(a):\n  return a", "python")).toBe("solve");
    expect(findEntryFunction("def twoSum(nums, target):\n  pass", "python")).toBe("twoSum");
    expect(findEntryFunction("class Solution:\n    def twoSum(self, nums, target):\n        pass", "python")).toBe("Solution().twoSum");
    expect(findEntryFunction("var twoSum = function(nums, target) {}", "javascript")).toBe("twoSum");
    expect(findEntryFunction("const solve = (a) => a", "javascript")).toBe("solve");
  });

  it("never interpolates the example input into the program source", () => {
    const program = buildProgram("def solve(s):\n  return s", "python", 's = "__import__(\'os\').system(\'rm -rf /\')"');
    expect("source" in program && program.source).not.toContain("rm -rf");
    expect("stdin" in program && program.stdin).toContain("rm -rf");
  });

  it("passes raw stdin through for compiled languages", () => {
    expect(buildProgram("int main(){}", "cpp", "nums = [1]")).toEqual({ source: "int main(){}", stdin: "nums = [1]" });
  });

  it("reports a helpful error when no function is defined", () => {
    expect(buildProgram("print(1)", "python", "a = 1")).toHaveProperty("error");
  });

  it("compares outputs structurally", () => {
    expect(outputsMatch("[0, 1]", "[0,1]")).toBe(true);
    expect(outputsMatch("3\n", "3")).toBe(true);
    expect(outputsMatch('"abc"', '"abc"')).toBe(true);
    expect(outputsMatch("[1,0]", "[0,1]")).toBe(false);
  });
});

describe("sandbox execution", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("refuses to run code when no sandbox is configured", async () => {
    vi.stubEnv("CODE_RUNNER_URL", "");
    const result = await runTestCase("def solve(a):\n  return a", "python", { input: "a = 1", output: "1" });
    expect(result).toMatchObject({ status: 503 });
  });

  it("judges sandbox output against the expected value", async () => {
    vi.stubEnv("CODE_RUNNER_URL", "http://sandbox.test/api/v2/execute");
    const fetchMock = vi.fn(async () => Response.json({ run: { stdout: "[0,1]\n", stderr: "", code: 0, signal: null } }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await runTestCase("def solve(nums, target):\n  return [0,1]", "python", {
      input: "nums = [2,7], target = 9",
      output: "[0,1]",
    });
    expect(result).toMatchObject({ passed: true, actual: "[0,1]" });
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.stdin).toBe("[[2,7],9]");
  });

  it("marks timeouts as failures", async () => {
    vi.stubEnv("CODE_RUNNER_URL", "http://sandbox.test/api/v2/execute");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ run: { stdout: "", stderr: "", code: null, signal: "SIGKILL" } })));
    const result = await runTestCase("def solve(a):\n  while True: pass", "python", { input: "a = 1", output: "1" });
    expect(result).toMatchObject({ passed: false });
    expect((result as { error?: string }).error).toMatch(/Time limit/);
  });
});

describe("Wandbox runner", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("is selected from the URL and fixes Java's public Main class", () => {
    expect(runnerKind("https://wandbox.org/api/compile.json")).toBe("wandbox");
    expect(runnerKind("http://localhost:2000/api/v2/execute")).toBe("piston");
    expect(wandboxSource("java", "public class Main {}")).toBe("class Main {}");
    expect(wandboxSource("python", "public class Main")).toBe("public class Main");
  });

  it("sends the Wandbox request format and judges the output", async () => {
    vi.stubEnv("CODE_RUNNER_URL", "https://wandbox.org/api/compile.json");
    const fetchMock = vi.fn(async () => Response.json({ status: "0", program_output: "[0,1]\n", program_error: "", compiler_error: "", signal: "" }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await runTestCase("def solve(nums, target):\n  return [0,1]", "python", { input: "nums = [2,7], target = 9", output: "[0,1]" });
    expect(r).toMatchObject({ passed: true });
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body).toMatchObject({ compiler: "cpython-3.12.7", stdin: "[[2,7],9]", save: false });
  });

  it("reports compile errors as failures", async () => {
    vi.stubEnv("CODE_RUNNER_URL", "https://wandbox.org/api/compile.json");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ status: "1", compiler_error: "prog.cc:1: error", program_output: "", signal: "" })));
    const r = await runTestCase("int main( {", "cpp", { input: "x", output: "1" });
    expect(r).toMatchObject({ passed: false });
    expect((r as { error?: string }).error).toContain("error");
  });
});
