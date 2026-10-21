import { beforeEach, describe, expect, it, vi } from "vitest";

import { FakeDb } from "../helpers/fakeDb";
import { makePdf } from "../helpers/pdf";
import { jsonRequest, newUser, params, type TestState } from "../helpers/setup";

const state = vi.hoisted(() => ({ user: null, db: null, llm: null }) as TestState);
vi.mock("@/lib/auth", async (orig) => ({ ...(await orig<typeof import("@/lib/auth")>()), getCurrentUser: async () => state.user }));
vi.mock("@/lib/mongodb", async (orig) => ({ ...(await orig<typeof import("@/lib/mongodb")>()), getDb: async () => state.db }));
vi.mock("@/lib/llm", async (orig) => ({ ...(await orig<typeof import("@/lib/llm")>()), llmText: vi.fn(async (p: { system: string; user: string }) => (state.llm ? state.llm(p) : null)) }));

import { GET as listResumes, POST as upload } from "@/app/api/resume/route";
import { DELETE as deleteResume, GET as getResume } from "@/app/api/resume/[id]/route";
import { POST as reprocess } from "@/app/api/resume/[id]/reprocess/route";
import { extractResumeText } from "@/lib/resumeExtract";

const PAGE1 = ["Jordan Kim", "jordan@example.com", "Skills", "Python, Flask, PostgreSQL", "Academic Projects", "Library Booking System | Flask, PostgreSQL", "- Room booking with conflict checks"];
const PAGE2 = ["Jordan Kim", "Course Planner", "- Recommends course schedules", "Education", "Tech Institute - B.Sc in Computing - 2019 - 2023"];

function uploadFile(bytes: Uint8Array, name = "cv.pdf") {
  const form = new FormData();
  form.set("resume", new File([bytes as BlobPart], name, { type: "application/pdf" }));
  return upload(new Request("http://localhost/api/resume", { method: "POST", body: form }));
}

beforeEach(() => {
  state.db = new FakeDb();
  state.user = newUser();
  state.llm = null;
  vi.stubEnv("HUGGINGFACE_API_KEY", "");
  vi.stubEnv("OPENAI_API_KEY", "");
});

describe("PDF extraction", () => {
  it("reads a multi-page PDF with line structure intact", async () => {
    const r = await extractResumeText(makePdf([PAGE1, PAGE2]), "pdf");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.text).toContain("Academic Projects\n");
      expect(r.text).toContain("Course Planner");
    }
  }, 30000);

  it("reports malformed PDFs and PDFs without a text layer", async () => {
    const broken = await extractResumeText(new TextEncoder().encode("%PDF-1.4\nthis is not a pdf"), "pdf");
    expect(broken).toMatchObject({ ok: false, status: 422 });
    const imageOnly = await extractResumeText(makePdf([[]]), "pdf");
    expect(imageOnly.ok).toBe(false);
    if (!imageOnly.ok) expect(imageOnly.error).toMatch(/scanned|could not be read/i);
  }, 30000);
});

describe("resume upload pipeline", () => {
  it("parses projects split across pages, persists them for the user, and returns them again", async () => {
    const res = await uploadFile(makePdf([PAGE1, PAGE2]));
    const data = (await res.json()) as { ok: boolean; resumeId: string; parsed: { projects: Array<{ name: string; technologies: string[] }> }; warnings: string[] };
    expect(res.status).toBe(200);
    expect(data.parsed.projects.map((p) => p.name)).toEqual(["Library Booking System", "Course Planner"]);
    expect(data.parsed.projects[0].technologies).toEqual(expect.arrayContaining(["Flask", "PostgreSQL"]));
    expect(data.warnings.join(" ")).toMatch(/not configured/);

    const stored = state.db!.collection("resumes").docs[0];
    expect(stored.userId).toBe(state.user!.id);
    expect(stored).not.toHaveProperty("file");

    const got = (await (await getResume(jsonRequest(`/api/resume/${data.resumeId}`), params({ id: data.resumeId }))).json()) as { resume: { parsed: { projects: unknown[] } } };
    expect(got.resume.parsed.projects).toHaveLength(2);
    const list = (await (await listResumes()).json()) as { resumes: Array<{ projectCount: number }> };
    expect(list.resumes[0].projectCount).toBe(2);
  }, 30000);

  it("keeps resumes private to their owner", async () => {
    const data = (await (await uploadFile(makePdf([PAGE1]))).json()) as { resumeId: string };
    state.user = newUser();
    expect((await getResume(jsonRequest(`/api/resume/${data.resumeId}`), params({ id: data.resumeId }))).status).toBe(404);
    expect((await reprocess(jsonRequest(`/api/resume/${data.resumeId}/reprocess`, {}), params({ id: data.resumeId }))).status).toBe(404);
    expect((await deleteResume(jsonRequest(`/api/resume/${data.resumeId}`), params({ id: data.resumeId }))).status).toBe(404);
    expect(state.db!.collection("resumes").docs).toHaveLength(1);
    expect(((await (await listResumes()).json()) as { resumes: unknown[] }).resumes).toHaveLength(0);
  }, 30000);

  it("reprocesses stored text when AI becomes available", async () => {
    const data = (await (await uploadFile(makePdf([PAGE1, PAGE2]))).json()) as { resumeId: string };
    vi.stubEnv("HUGGINGFACE_API_KEY", "k");
    state.llm = () => ({
      text: JSON.stringify({ name: "Jordan Kim", projects: [{ name: "Library Booking System", description: "Room booking with conflict checks", technologies: ["Flask"] }, { name: "Course Planner" }] }),
      provider: "huggingface",
    });
    const res = await reprocess(jsonRequest(`/api/resume/${data.resumeId}/reprocess`, {}), params({ id: data.resumeId }));
    const out = (await res.json()) as { resume: { source: string; parsed: { projects: Array<{ description: string }> } } };
    expect(out.resume.source).toBe("ai");
    expect(out.resume.parsed.projects[0].description).toBe("Room booking with conflict checks");
  }, 30000);

  it("rejects image-only PDFs with a clear message", async () => {
    const res = await uploadFile(makePdf([[]]));
    expect(res.status).toBe(422);
    expect(state.db!.collection("resumes").docs).toHaveLength(0);
  }, 30000);
});
