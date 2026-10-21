// Creates the admin/superadmin accounts configured in the environment.
// Usage: npm run provision:admins   (reads .env.local if present)
// Never prints passwords or hashes. Exits non-zero on validation errors or conflicts.
import { existsSync } from "node:fs";
import { MongoClient } from "mongodb";

import { provisionPrivilegedAccounts, readPrivilegedAccountsFromEnv } from "../lib/adminProvisioning.mjs";

if (existsSync(".env.local") && typeof process.loadEnvFile === "function") process.loadEnvFile(".env.local");

const { accounts, errors } = readPrivilegedAccountsFromEnv(process.env);
if (errors.length) {
  for (const e of errors) console.error(`✗ ${e}`);
  process.exit(1);
}
if (!process.env.MONGODB_URI) {
  console.error("✗ MONGODB_URI is not set.");
  process.exit(1);
}

const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
try {
  await client.connect();
  const db = client.db(process.env.MONGODB_DB || "interview_simulator");
  // Same unique index the app creates; it makes concurrent runs safe.
  await db.collection("users").createIndex({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: "string" } } });
  const results = await provisionPrivilegedAccounts(db, accounts);
  let conflicts = 0;
  for (const r of results) {
    const mark = r.status === "conflict" ? "!" : "✓";
    if (r.status === "conflict") conflicts += 1;
    console.log(`${mark} ${r.role.padEnd(10)} ${r.email} — ${r.message}`);
  }
  process.exitCode = conflicts ? 2 : 0;
} catch (err) {
  console.error("✗ Provisioning failed:", err instanceof Error ? err.message.replace(/mongodb(\+srv)?:\/\/[^@]*@/g, "mongodb://<redacted>@") : "unknown error");
  process.exitCode = 1;
} finally {
  await client.close().catch(() => undefined);
}
