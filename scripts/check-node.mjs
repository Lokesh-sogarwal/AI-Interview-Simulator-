function fail(message) {
  // eslint-disable-next-line no-console
  console.error(message);
  process.exit(1);
}

const version = process.versions.node;
const [majorStr, minorStr] = version.split(".");
const major = Number(majorStr);
const minor = Number(minorStr);

if (!Number.isFinite(major) || !Number.isFinite(minor)) {
  fail(`Unsupported Node.js version: ${version}`);
}

// Next.js 16 supports current LTS lines; keep this strict.
// Accept Node 20.x, 21.x, 22.x (recommend 22 LTS).
const ok = major === 20 || major === 21 || major === 22;
if (!ok) {
  fail(
    [
      `Node.js ${version} is not supported for this project.`,
      "Use Node 22 LTS (recommended) or Node 20/21.",
      "If you use nvm:",
      "  nvm install 22",
      "  nvm use 22",
    ].join("\n"),
  );
}
