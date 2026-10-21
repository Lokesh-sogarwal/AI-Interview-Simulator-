import { ObjectId, type Db, type Document } from "mongodb";

import { aiFailureDetail, llmText } from "@/lib/llm";
import { parseResume, resumeContextForPrompt, type LLMCall, type ParseOutcome, type ParsedResume } from "@/lib/resumeParsing";

/** LLM adapter for the parser, or null when no provider is configured. */
export function resumeLLM(): LLMCall | null {
  if (!process.env.OPENROUTER_API_KEY && !process.env.HUGGINGFACE_API_KEY && !process.env.OPENAI_API_KEY) return null;
  return async ({ system, user, maxTokens }) => {
    const out = await llmText({
      system,
      user,
      maxTokens,
      temperature: 0.1,
      models: { huggingface: process.env.HUGGINGFACE_MODEL_RESUME || process.env.HUGGINGFACE_MODEL, openai: process.env.OPENAI_MODEL },
    });
    return out?.text ?? null;
  };
}

export type StoredResume = {
  _id: ObjectId;
  userId: string;
  fileName: string;
  fileType: string;
  size: number;
  rawText: string;
  parsed: ParsedResume;
  warnings: string[];
  detectedSections: string[];
  missingSections: string[];
  diagnostics: ParseOutcome["diagnostics"];
  createdAt: Date;
  updatedAt: Date;
};

export function publicResume(doc: StoredResume, includeText = false) {
  return {
    id: String(doc._id),
    fileName: doc.fileName,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    parsed: doc.parsed,
    warnings: doc.warnings,
    detectedSections: doc.detectedSections,
    missingSections: doc.missingSections,
    source: doc.parsed?.sourceMetadata?.source ?? "rules",
    ...(includeText ? { rawText: doc.rawText } : {}),
  };
}

export async function saveParsedResume(
  db: Db,
  input: { userId: string; fileName: string; fileType: string; size: number; rawText: string; outcome: ParseOutcome },
) {
  const now = new Date();
  const doc = {
    userId: input.userId,
    fileName: input.fileName,
    fileType: input.fileType,
    size: input.size,
    rawText: input.rawText,
    parsed: input.outcome.parsed,
    warnings: input.outcome.warnings,
    detectedSections: input.outcome.detectedSections,
    missingSections: input.outcome.missingSections,
    diagnostics: input.outcome.diagnostics,
    createdAt: now,
    updatedAt: now,
  };
  const res = await db.collection("resumes").insertOne(doc);
  return { ...doc, _id: res.insertedId } as StoredResume;
}

/** Loads one of the user's resumes; ownership is part of the query. */
export async function loadOwnResume(db: Db, userId: string, resumeId: unknown) {
  if (typeof resumeId !== "string" || !/^[a-f\d]{24}$/i.test(resumeId)) return null;
  return (await db.collection("resumes").findOne({ _id: new ObjectId(resumeId), userId })) as StoredResume | null;
}

export async function reprocessResume(db: Db, doc: StoredResume) {
  const outcome = await parseResume(doc.rawText, resumeLLM(), new Date(), () => aiFailureDetail().text);
  const update = {
    parsed: outcome.parsed,
    warnings: outcome.warnings,
    detectedSections: outcome.detectedSections,
    missingSections: outcome.missingSections,
    diagnostics: outcome.diagnostics,
    updatedAt: new Date(),
  };
  await db.collection("resumes").updateOne({ _id: doc._id, userId: doc.userId }, { $set: update });
  return { ...doc, ...update };
}

export { resumeContextForPrompt };

/** Resume context for an interview: the stored parsed resume when linked, else legacy text. */
export async function interviewResumeContext(db: Db, interview: Document) {
  if (interview.useResume === false) return { context: "", parsed: null as ParsedResume | null, resumeId: null as string | null };
  if (typeof interview.userId === "string" && interview.resumeId) {
    const doc = await loadOwnResume(db, interview.userId, interview.resumeId);
    if (doc?.parsed) return { context: resumeContextForPrompt(doc.parsed), parsed: doc.parsed, resumeId: String(doc._id) };
  }
  const legacy = interview.resumeProfile ? JSON.stringify(interview.resumeProfile) : typeof interview.resumeText === "string" ? interview.resumeText : "";
  return { context: legacy.slice(0, 3500), parsed: null, resumeId: null };
}
