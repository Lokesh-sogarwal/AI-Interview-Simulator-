import { getCurrentUser } from "@/lib/auth";
import { aiFailureDetail } from "@/lib/llm";
import { dbUnavailableMessage, getDb } from "@/lib/mongodb";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { MAX_RESUME_BYTES, detectResumeKind } from "@/lib/resume";
import { extractResumeText } from "@/lib/resumeExtract";
import { parseResume } from "@/lib/resumeParsing";
import { publicResume, resumeLLM, saveParsedResume, type StoredResume } from "@/lib/resumeStore";

/** The signed-in user's resumes, newest first (summaries only). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const db = await getDb();
  if (!db) return Response.json({ ok: false, error: dbUnavailableMessage() }, { status: 503 });
  const docs = (await db
    .collection("resumes")
    .find({ userId: user.id }, { projection: { rawText: 0, diagnostics: 0 } })
    .sort({ createdAt: -1 })
    .limit(20)
    .toArray()) as StoredResume[];
  return Response.json({
    ok: true,
    resumes: docs.map((d) => ({
      id: String(d._id),
      fileName: d.fileName,
      createdAt: d.createdAt,
      projectCount: d.parsed?.projects?.length ?? 0,
      source: d.parsed?.sourceMetadata?.source ?? "rules",
      warnings: d.warnings?.length ?? 0,
    })),
  });
}

/**
 * Upload → extract text → two-stage parse → persist for this user.
 * The original file is not stored; the extracted text is, so the resume can be
 * reprocessed without uploading it again.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const rl = rateLimit(request, { keyPrefix: "resume:upload", key: user.id, limit: 10, windowMs: 10 * 60 * 1000 });
  if (!rl.ok) return rateLimitResponse(rl.resetAt);

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_RESUME_BYTES + 64 * 1024) {
    return Response.json({ ok: false, error: "Resume file is too large (max 5MB)." }, { status: 413 });
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) return Response.json({ ok: false, error: "Expected a multipart form upload." }, { status: 400 });
  const resume = formData.get("resume");
  if (!(resume instanceof File)) {
    return Response.json({ ok: false, error: "Missing resume file (field name: resume)." }, { status: 400 });
  }
  if (resume.size === 0) return Response.json({ ok: false, error: "The uploaded file is empty." }, { status: 400 });
  if (resume.size > MAX_RESUME_BYTES) {
    return Response.json({ ok: false, error: "Resume file is too large (max 5MB)." }, { status: 413 });
  }

  const bytes = new Uint8Array(await resume.arrayBuffer());
  const kind = detectResumeKind(resume.name, resume.type, bytes.slice(0, 1024));
  if (!kind) {
    return Response.json({ ok: false, error: "Unsupported file type. Upload a PDF (with selectable text) or a .txt file." }, { status: 415 });
  }

  const extracted = await extractResumeText(bytes, kind);
  if (!extracted.ok) return Response.json({ ok: false, error: extracted.error }, { status: extracted.status });

  const outcome = await parseResume(extracted.text, resumeLLM(), new Date(), () => aiFailureDetail().text);
  // Display-safe basename only.
  const fileName = resume.name.split(/[\\/]/).pop()?.slice(0, 120) || "resume";

  const db = await getDb();
  const saved = db
    ? await saveParsedResume(db, { userId: user.id, fileName, fileType: kind, size: resume.size, rawText: extracted.text, outcome }).catch((e) => {
        console.error("[resume] could not persist parsed resume:", e instanceof Error ? e.message : e);
        return null;
      })
    : null;

  return Response.json({
    ok: true,
    // Existing contract.
    filename: fileName,
    size: resume.size,
    type: resume.type,
    resumeText: extracted.text,
    // Structured result.
    resumeId: saved ? String(saved._id) : null,
    persisted: Boolean(saved),
    ...(saved
      ? publicResume(saved)
      : { parsed: outcome.parsed, warnings: [...outcome.warnings, "This resume could not be saved to your account."], detectedSections: outcome.detectedSections, missingSections: outcome.missingSections, source: outcome.parsed.sourceMetadata.source }),
  });
}
