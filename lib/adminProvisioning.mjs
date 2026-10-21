// @ts-check
/**
 * Idempotent bootstrap of the environment-configured admin and superadmin
 * accounts. Used by `npm run provision:admins` (scripts/provision-admins.mjs)
 * and by the tests. Plain ESM so it runs under Node without a build step.
 *
 * Safety rules:
 * - Only creates accounts. An existing user with a configured email is never
 *   elevated and its password is never reset; it is reported as a conflict.
 * - Nothing runs at import time and nothing runs on ordinary app requests.
 * - Passwords and hashes are never logged or returned.
 */
import bcrypt from "bcryptjs";

export const MIN_PRIVILEGED_PASSWORD_LENGTH = 12;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PLACEHOLDER_RE = /replace-with|change[_-]?me|password123|example-password/i;

/**
 * @typedef {{ role: "admin" | "superadmin", name: string, email: string, password: string }} PrivilegedAccount
 * @typedef {{ email: string, role: string, status: "created" | "exists" | "conflict", message: string }} ProvisionResult
 */

/**
 * Reads and validates the bootstrap variables. Each account is optional, but
 * an account whose email is set must also have a valid password.
 * @param {Record<string, string | undefined>} env
 * @returns {{ accounts: PrivilegedAccount[], errors: string[] }}
 */
export function readPrivilegedAccountsFromEnv(env) {
  /** @type {PrivilegedAccount[]} */
  const accounts = [];
  /** @type {string[]} */
  const errors = [];

  for (const [prefix, role] of /** @type {const} */ ([["SUPERADMIN", "superadmin"], ["ADMIN", "admin"]])) {
    const email = String(env[`${prefix}_EMAIL`] ?? "").trim().toLowerCase();
    const password = String(env[`${prefix}_PASSWORD`] ?? "");
    const name = String(env[`${prefix}_NAME`] ?? "").trim() || (role === "superadmin" ? "Super Administrator" : "Administrator");
    if (!email && !password) continue;

    if (!email) errors.push(`${prefix}_EMAIL is required when ${prefix}_PASSWORD is set.`);
    else if (!EMAIL_RE.test(email) || email.length > 320) errors.push(`${prefix}_EMAIL is not a valid email address.`);

    if (!password) errors.push(`${prefix}_PASSWORD is required.`);
    else if (password.length < MIN_PRIVILEGED_PASSWORD_LENGTH) errors.push(`${prefix}_PASSWORD must be at least ${MIN_PRIVILEGED_PASSWORD_LENGTH} characters.`);
    else if (Buffer.byteLength(password, "utf8") > 72) errors.push(`${prefix}_PASSWORD must be at most 72 bytes (bcrypt limit).`);
    else if (PLACEHOLDER_RE.test(password)) errors.push(`${prefix}_PASSWORD looks like a placeholder; use a strong unique secret.`);
    else if (email && password.toLowerCase().includes(email.split("@")[0])) errors.push(`${prefix}_PASSWORD must not contain the account name.`);

    if (name.length > 80) errors.push(`${prefix}_NAME must be 80 characters or fewer.`);
    accounts.push({ role, name, email, password });
  }

  if (accounts.length === 0 && errors.length === 0) {
    errors.push("No privileged accounts configured. Set SUPERADMIN_EMAIL/SUPERADMIN_PASSWORD and/or ADMIN_EMAIL/ADMIN_PASSWORD.");
  }
  if (accounts.length === 2) {
    if (accounts[0].email && accounts[0].email === accounts[1].email) errors.push("ADMIN_EMAIL and SUPERADMIN_EMAIL must be different.");
    if (accounts[0].password && accounts[0].password === accounts[1].password) errors.push("ADMIN_PASSWORD and SUPERADMIN_PASSWORD must be different.");
  }
  return { accounts: errors.length ? [] : accounts, errors };
}

/** @param {unknown} err */
function isDuplicateKey(err) {
  return typeof err === "object" && err !== null && /** @type {{ code?: unknown }} */ (err).code === 11000;
}

/**
 * @param {import("mongodb").Document | null} doc
 * @param {"admin" | "superadmin"} role
 */
function classifyExisting(doc, role) {
  const sameRole = doc?.role === role && doc?.provisionedBy === "env-bootstrap";
  return sameRole
    ? { status: /** @type {const} */ ("exists"), message: "Already provisioned; left unchanged." }
    : {
        status: /** @type {const} */ ("conflict"),
        message: "An account with this email already exists and was NOT modified or elevated. Use a different email, or change its role deliberately via a superadmin.",
      };
}

/**
 * Creates any missing privileged accounts. Safe to run repeatedly and
 * concurrently (relies on the unique index on users.email).
 * @param {import("mongodb").Db} db
 * @param {PrivilegedAccount[]} accounts
 * @param {{ bcryptRounds?: number, now?: () => Date }} [options]
 * @returns {Promise<ProvisionResult[]>}
 */
export async function provisionPrivilegedAccounts(db, accounts, options = {}) {
  const users = db.collection("users");
  const rounds = options.bcryptRounds ?? 12;
  const now = options.now ?? (() => new Date());
  /** @type {ProvisionResult[]} */
  const results = [];

  for (const account of accounts) {
    const existing = await users.findOne({ email: account.email }, { projection: { role: 1, provisionedBy: 1 } });
    if (existing) {
      results.push({ email: account.email, role: account.role, ...classifyExisting(existing, account.role) });
      continue;
    }

    const passwordHash = await bcrypt.hash(account.password, rounds);
    try {
      const at = now();
      const inserted = await users.insertOne({
        name: account.name,
        email: account.email,
        passwordHash,
        role: account.role,
        isAdmin: true,
        // Provisioned by the deployment owner, who controls this mailbox.
        emailVerified: true,
        phoneVerified: false,
        provisionedBy: "env-bootstrap",
        createdAt: at,
        roleUpdatedAt: at,
      });
      await db.collection("audit_logs").insertOne({
        actorId: null,
        action: "user.provisioned",
        targetId: String(inserted.insertedId),
        details: { email: account.email, role: account.role, source: "env-bootstrap" },
        at,
      });
      results.push({ email: account.email, role: account.role, status: "created", message: "Created." });
    } catch (err) {
      if (!isDuplicateKey(err)) throw err;
      // Lost a race with a concurrent bootstrap run.
      const doc = await users.findOne({ email: account.email }, { projection: { role: 1, provisionedBy: 1 } });
      results.push({ email: account.email, role: account.role, ...classifyExisting(doc, account.role) });
    }
  }
  return results;
}
