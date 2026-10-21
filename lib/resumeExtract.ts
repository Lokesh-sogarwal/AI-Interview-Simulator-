/**
 * Stage A, step 0: get text out of an uploaded resume file. PDFs are read
 * with pdf-parse, falling back to pdfjs-dist; both keep line breaks so section
 * headings survive. Scanned (image-only) PDFs have no text layer and are
 * reported as such: OCR is not bundled.
 */
export const MAX_RESUME_TEXT_CHARS = 20000;
const MAX_PAGES = 10;

type ExtractResult = { ok: true; text: string; pages: number | null; method: "pdf-parse" | "pdfjs" | "text" } | { ok: false; error: string; status: number };

function clean(raw: string) {
  return raw
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
    .slice(0, MAX_RESUME_TEXT_CHARS);
}

async function withPdfParse(data: Uint8Array): Promise<{ text: string; pages: number } | null> {
  try {
    const mod = (await import("pdf-parse")) as unknown as {
      PDFParse?: new (o: unknown) => { getText: (o?: unknown) => Promise<{ text: string; total?: number }>; destroy?: () => Promise<void> };
      VerbosityLevel?: { ERRORS: number };
    };
    if (!mod.PDFParse) return null;
    const parser = new mod.PDFParse({ data, verbosity: mod.VerbosityLevel?.ERRORS });
    try {
      const out = await parser.getText({ pageJoiner: "\n", first: MAX_PAGES });
      return { text: out?.text ?? "", pages: Number(out?.total) || 0 };
    } finally {
      await parser.destroy?.().catch(() => undefined);
    }
  } catch (e) {
    console.error("[resume] pdf-parse failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

async function withPdfJs(data: Uint8Array): Promise<{ text: string; pages: number } | null> {
  // pdf-parse bundles a newer pdf.js and registers its worker globally; hide it so
  // this pdfjs-dist copy uses its own matching in-process worker.
  const g = globalThis as { pdfjsWorker?: unknown };
  const sharedWorker = g.pdfjsWorker;
  delete g.pdfjsWorker;
  try {
    const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as {
      getDocument: (o: unknown) => { promise: Promise<{ numPages: number; getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: Array<{ str?: string; hasEOL?: boolean }> }> }>; destroy?: () => Promise<void> }> };
    };
    const doc = await pdfjs.getDocument({ data, disableWorker: true, isEvalSupported: false }).promise;
    const chunks: string[] = [];
    for (let n = 1; n <= Math.min(doc.numPages, MAX_PAGES); n += 1) {
      const content = await (await doc.getPage(n)).getTextContent();
      chunks.push(content.items.map((it) => (it.str ?? "") + (it.hasEOL ? "\n" : "")).join(""));
    }
    await doc.destroy?.().catch(() => undefined);
    return { text: chunks.join("\n"), pages: doc.numPages };
  } catch (e) {
    console.error("[resume] pdfjs fallback failed:", e instanceof Error ? e.message : e);
    return null;
  } finally {
    if (sharedWorker !== undefined) g.pdfjsWorker = sharedWorker;
  }
}

export async function extractResumeText(bytes: Uint8Array, kind: "pdf" | "text"): Promise<ExtractResult> {
  if (kind === "text") {
    const text = clean(new TextDecoder("utf-8", { fatal: false }).decode(bytes));
    return text ? { ok: true, text, pages: null, method: "text" } : { ok: false, error: "The text file is empty.", status: 400 };
  }
  // Copies: pdf.js may transfer (detach) the buffer it is given.
  const first = await withPdfParse(bytes.slice());
  if (first && clean(first.text)) return { ok: true, text: clean(first.text), pages: first.pages, method: "pdf-parse" };
  const second = await withPdfJs(bytes.slice());
  if (second && clean(second.text)) return { ok: true, text: clean(second.text), pages: second.pages, method: "pdfjs" };
  if (!first && !second) return { ok: false, error: "This PDF could not be read. It may be damaged or password-protected.", status: 422 };
  return {
    ok: false,
    error: "No text could be extracted from this PDF. It looks like a scanned image; OCR is not supported. Export a PDF with selectable text or upload a .txt file.",
    status: 422,
  };
}
