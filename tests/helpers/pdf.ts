/**
 * Builds a minimal, valid PDF with one text line per row (Helvetica) and one
 * page per entry in `pages`. Synthetic fixtures only; no real resumes.
 */
export function makePdf(pages: string[][]): Uint8Array {
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const objects: string[] = [];
  const pageIds: number[] = [];
  // 1: catalog, 2: pages, 3: font, then (page, content) pairs.
  let next = 4;
  const pageObjs: Array<{ id: number; contentId: number; stream: string }> = [];
  for (const lines of pages) {
    const id = next++;
    const contentId = next++;
    pageIds.push(id);
    const stream = ["BT", "/F1 11 Tf", "14 TL", "50 780 Td", ...lines.map((l) => `(${esc(l)}) Tj T*`), "ET"].join("\n");
    pageObjs.push({ id, contentId, stream });
  }
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((i) => `${i} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  for (const p of pageObjs) {
    objects[p.id] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${p.contentId} 0 R >>`;
    objects[p.contentId] = `<< /Length ${Buffer.byteLength(p.stream, "latin1")} >>\nstream\n${p.stream}\nendstream`;
  }
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let i = 1; i < objects.length; i += 1) {
    offsets[i] = Buffer.byteLength(out, "latin1");
    out += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objects.length; i += 1) out += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(out, "latin1"));
}
