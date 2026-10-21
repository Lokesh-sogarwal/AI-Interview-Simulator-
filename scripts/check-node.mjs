function fail(message) {
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

// Next.js 16 requires Node.js 20.9 or newer.
const ok = major > 20 || (major === 20 && minor >= 9);
if (!ok) {
  fail(
    [
      `Node.js ${version} is not supported for this project.`,
      "Use Node 22 or 24 LTS (Node 20.9+ also works).",
      "If you use nvm:",
      "  nvm install 22",
      "  nvm use 22",
    ].join("\n"),
  );
}
