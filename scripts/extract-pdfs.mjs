import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pdfModule = require("pdf-parse");
const { PDFParse, VerbosityLevel } = pdfModule;

const repoRoot = process.cwd();
const outDir = path.join(repoRoot, "docs", "extracted");

const inputs = [
  {
    label: "roadmap",
    filePath: "/Users/lokesh/Downloads/AI_Mock_Interview_Simulator_Roadmap.pdf",
  },
  {
    label: "prompt-templates",
    filePath:
      "/Users/lokesh/Downloads/AI_Mock_Interview_Prompt_Templates.pdf",
  },
  {
    label: "nextjs-guide",
    filePath: "/Users/lokesh/Downloads/ai_interview_simulator_nextjs_guide.pdf",
  },
];

await fs.promises.mkdir(outDir, { recursive: true });

for (const input of inputs) {
  const buffer = await fs.promises.readFile(input.filePath);
  const parser = new PDFParse({
    data: buffer,
    verbosity: VerbosityLevel.ERRORS,
  });
  const parsed = await parser.getText({ pageJoiner: "\n\n" });

  const content = [
    `# ${input.label}`,
    "",
    `Source: ${input.filePath}`,
    "",
    (parsed.text || "").trim(),
    "",
  ].join("\n");

  const outPath = path.join(outDir, `${input.label}.txt`);
  await fs.promises.writeFile(outPath, content, "utf8");
  console.log(
    `Wrote ${path.relative(repoRoot, outPath)} (${parsed.total ?? "?"} pages)`,
  );
}
