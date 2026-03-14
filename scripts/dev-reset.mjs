import { execSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function run(cmd) {
  try {
    return execSync(cmd, { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function killPids(pids) {
  for (const pid of pids) {
    if (!pid) continue;
    try {
      process.kill(Number(pid), "SIGTERM");
    } catch {
      // ignore
    }
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const port = process.env.PORT ? Number(process.env.PORT) : 3002;
  if (!Number.isFinite(port)) {
    console.error("Invalid PORT.\n");
    process.exit(1);
  }

  const lockFile = path.join(process.cwd(), ".next", "dev", "lock");

  // Stop any process currently listening on the chosen port.
  const pidText = run(`lsof -ti tcp:${port} || true`);
  const pids = pidText.split(/\s+/).map((s) => s.trim()).filter(Boolean);

  if (pids.length) {
    console.log(`Stopping processes on port ${port}: ${pids.join(", ")}`);
    killPids(pids);
    await sleep(250);

    // If still running, force kill.
    const remainingText = run(`lsof -ti tcp:${port} || true`);
    const remaining = remainingText.split(/\s+/).map((s) => s.trim()).filter(Boolean);
    if (remaining.length) {
      console.log(`Force-stopping: ${remaining.join(", ")}`);
      for (const pid of remaining) {
        try {
          process.kill(Number(pid), "SIGKILL");
        } catch {
          // ignore
        }
      }
      await sleep(150);
    }
  }

  // Remove stale dev lock if present.
  try {
    if (fs.existsSync(lockFile)) {
      fs.unlinkSync(lockFile);
      console.log("Removed stale lock:", lockFile);
    }
  } catch {
    // ignore
  }

  console.log(`Starting next dev on port ${port} (auto-reload enabled)…`);
  const child = spawn("node", [path.join("node_modules", ".bin", "next"), "dev", "-p", String(port)], {
    stdio: "inherit",
    env: process.env,
  });

  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });
}

main();
