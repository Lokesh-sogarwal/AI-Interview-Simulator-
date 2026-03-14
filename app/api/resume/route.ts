import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const rl = rateLimit(request, {
    keyPrefix: "resume:upload",
    limit: 10,
    windowMs: 10 * 60 * 1000,
  });
  if (!rl.ok) return rateLimitResponse(rl.resetAt);

  const formData = await request.formData();
  const resume = formData.get("resume");

  if (!(resume instanceof File)) {
    return Response.json(
      { ok: false, error: "Missing resume file (field name: resume)." },
      { status: 400 },
    );
  }

  // Keep parsing work bounded.
  const maxBytes = 5 * 1024 * 1024;
  if (resume.size > maxBytes) {
    return Response.json(
      { ok: false, error: "Resume file is too large (max 5MB)." },
      { status: 413 },
    );
  }

  let resumeText: string | null = null;
  const isPdf =
    resume.type === "application/pdf" || resume.name.toLowerCase().endsWith(".pdf");

  const debug: {
    pdfParse?: { tried: boolean; textLen: number; error: string | null };
    pdfJs?: { tried: boolean; textLen: number; error: string | null };
  } = {};

  function cleanText(raw: string) {
    let cleaned = raw.replace(/\r/g, "");
    cleaned = cleaned.replace(/[ \t]+\n/g, "\n");
    cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
    cleaned = cleaned.replace(/[ \t]{2,}/g, " ");
    cleaned = cleaned.trim();
    return cleaned;
  }

  async function extractWithPdfJs(buffer: Buffer): Promise<{ text: string | null; error: string | null }> {
    try {
      // pdfjs-dist has multiple entrypoints; legacy build works well in Node.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");

      // Turbopack sometimes fails to resolve the worker unless it's explicitly imported.
      // Force it into the server bundle and use the package specifier as workerSrc.
      try {
        await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
        if (pdfjs.GlobalWorkerOptions) {
          pdfjs.GlobalWorkerOptions.workerSrc = "pdfjs-dist/legacy/build/pdf.worker.mjs";
        }
      } catch {
        // ignore
      }

      const getDocument = pdfjs.getDocument || pdfjs.default?.getDocument;
      if (!getDocument) return { text: null, error: "pdfjs getDocument missing" };

      // In Next.js (Turbopack) server runtime, pdfjs worker chunks may not be emitted.
      // Disable workers so extraction works without pdf.worker.mjs.
      const loadingTask = getDocument({
        data: new Uint8Array(buffer),
        disableWorker: true,
      });
      const doc = await loadingTask.promise;

      const maxPages = Math.min(doc.numPages || 1, 8);
      const chunks: string[] = [];
      for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
        const page = await doc.getPage(pageNum);
        const content = await page.getTextContent();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const items = (content.items || []) as any[];
        const pageText = items
          .map((it) => (typeof it?.str === "string" ? it.str : ""))
          .filter(Boolean)
          .join(" ")
          .trim();
        if (pageText) chunks.push(pageText);

        const joined = chunks.join("\n\n");
        if (joined.length > 14000) break;
      }

      const joined = chunks.join("\n\n");
      if (!joined.trim()) return { text: null, error: null };

      let cleaned = joined.replace(/\r/g, "");
      cleaned = cleaned.replace(/[ \t]{2,}/g, " ");
      cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
      cleaned = cleaned.trim();
      return { text: cleaned || null, error: null };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown error";
      return { text: null, error: `pdfjs-dist failed: ${msg}` };
    }
  }

  if (isPdf) {
    const buffer = Buffer.from(await resume.arrayBuffer());

    // 1) Try pdf-parse (via PDFParse class)
    try {
      const pdfModule = await import("pdf-parse");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const PDFParse = (pdfModule as any).PDFParse as
        | (new (options: unknown) => { getText: (opts?: unknown) => Promise<{ text: string }> })
        | undefined;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const VerbosityLevel = (pdfModule as any).VerbosityLevel as any;

      if (PDFParse) {
        const parser = new PDFParse({
          data: buffer,
          verbosity: VerbosityLevel?.ERRORS,
        });
        const parsed = await parser.getText({ pageJoiner: "\n\n" });
        const cleaned = cleanText(parsed?.text || "");
        resumeText = cleaned || null;
        if (resumeText && resumeText.length > 12000) resumeText = resumeText.slice(0, 12000);

        debug.pdfParse = { tried: true, textLen: cleaned.length, error: null };
      } else {
        debug.pdfParse = { tried: true, textLen: 0, error: "PDFParse export missing" };
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown error";
      debug.pdfParse = { tried: true, textLen: 0, error: `pdf-parse threw: ${msg}` };
    }

    // 2) Fallback: pdfjs-dist text extraction
    if (!resumeText) {
      debug.pdfJs = { tried: true, textLen: 0, error: null };
      const { text: pdfjsText, error: pdfJsError } = await extractWithPdfJs(buffer);
      if (pdfJsError) {
        debug.pdfJs.error = pdfJsError;
      }

      if (pdfjsText) {
        const cleaned = cleanText(pdfjsText);
        debug.pdfJs.textLen = cleaned.length;

        resumeText = cleaned || null;
        if (resumeText && resumeText.length > 12000) resumeText = resumeText.slice(0, 12000);
      } else {
        debug.pdfJs.textLen = 0;
      }
    }
  }

  if (isPdf && !resumeText) {
    return Response.json(
      {
        ok: false,
        error:
          "Could not extract text from this PDF. If it is a scanned/image PDF, OCR is required. Please export a selectable-text PDF or upload a non-scanned PDF.",
        ...(process.env.NODE_ENV !== "production" ? { debug } : null),
      },
      { status: 400 },
    );
  }

  // Note: This endpoint intentionally does not persist the file.
  return Response.json({
    ok: true,
    filename: resume.name,
    size: resume.size,
    type: resume.type,
    resumeText,
  });
}
