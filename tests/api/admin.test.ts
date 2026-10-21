import { ObjectId } from "mongodb";
import bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FakeDb } from "../helpers/fakeDb";
import { jsonRequest, params, type TestState } from "../helpers/setup";

const state = vi.hoisted(() => ({ user: null, db: null, llm: null }) as TestState);
vi.mock("@/lib/auth", async (orig) => ({ ...(await orig<typeof import("@/lib/auth")>()), getCurrentUser: async () => state.user, setAuthCookie: async () => undefined }));
vi.mock("@/lib/mongodb", async (orig) => ({ ...(await orig<typeof import("@/lib/mongodb")>()), getDb: async () => state.db }));

import { provisionPrivilegedAccounts, readPrivilegedAccountsFromEnv } from "@/lib/adminProvisioning.mjs";
import { GET as listUsers } from "@/app/api/admin/users/route";
import { PATCH as setRole } from "@/app/api/admin/users/[id]/role/route";
import { POST as createContest } from "@/app/api/contests/route";
import { POST as signup } from "@/app/api/auth/signup/route";
import { isAdminInDb } from "@/lib/auth";
import { can, roleFromDoc } from "@/lib/roles";

const ENV = {
  SUPERADMIN_NAME: "Root",
  SUPERADMIN_EMAIL: "Root@Example.com",
  SUPERADMIN_PASSWORD: "t7#Qm2!vLp9@wX4z",
  ADMIN_NAME: "Ops",
  ADMIN_EMAIL: "ops@example.com",
  ADMIN_PASSWORD: "Z8$kd3&Nq1^rB6yE",
};

function addUser(role?: string, extra: Record<string, unknown> = {}) {
  const _id = new ObjectId();
  state.db!.collection("users").docs.push({ _id, name: `${role ?? "user"} person`, email: `${_id}@example.com`, ...(role ? { role } : {}), createdAt: new Date(), ...extra });
  return { id: String(_id), name: `${role ?? "user"} person`, email: `${_id}@example.com` };
}

function patchRole(id: string, role: unknown) {
  return setRole(new Request(`http://localhost/api/admin/users/${id}/role`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role }) }), params({ id }));
}

beforeEach(() => {
  state.db = new FakeDb();
  state.db.collection("users").uniqueKeys = [["email"]];
  state.user = null;
});

describe("bootstrap configuration", () => {
  it("normalises and validates both accounts", () => {
    const { accounts, errors } = readPrivilegedAccountsFromEnv(ENV);
    expect(errors).toEqual([]);
    expect(accounts.map((a) => [a.role, a.email])).toEqual([
      ["superadmin", "root@example.com"],
      ["admin", "ops@example.com"],
    ]);
  });

  it.each([
    [{}, /No privileged accounts configured/],
    [{ ADMIN_PASSWORD: ENV.ADMIN_PASSWORD }, /ADMIN_EMAIL is required/],
    [{ ADMIN_EMAIL: "not-an-email", ADMIN_PASSWORD: ENV.ADMIN_PASSWORD }, /not a valid email/],
    [{ ADMIN_EMAIL: "a@b.co", ADMIN_PASSWORD: "short" }, /at least 12/],
    [{ ADMIN_EMAIL: "a@b.co", ADMIN_PASSWORD: "replace-with-a-strong-unique-secret" }, /placeholder/],
    [{ ADMIN_EMAIL: "a@b.co" }, /ADMIN_PASSWORD is required/],
    [{ ...ENV, ADMIN_EMAIL: ENV.SUPERADMIN_EMAIL }, /must be different/],
    [{ ...ENV, ADMIN_PASSWORD: ENV.SUPERADMIN_PASSWORD }, /must be different/],
  ])("rejects %j", (env, message) => {
    const { accounts, errors } = readPrivilegedAccountsFromEnv(env as Record<string, string>);
    expect(accounts).toEqual([]);
    expect(errors.join(" ")).toMatch(message);
  });
});

describe("provisioning", () => {
  const accounts = () => readPrivilegedAccountsFromEnv(ENV).accounts;

  it("creates both accounts with hashed passwords, roles and an audit entry, without leaking secrets", async () => {
    const log = vi.spyOn(console, "log");
    const results = await provisionPrivilegedAccounts(state.db as never, accounts(), { bcryptRounds: 4 });
    expect(results.map((r) => r.status)).toEqual(["created", "created"]);
    const users = state.db!.collection("users").docs;
    expect(users.map((u) => u.role)).toEqual(["superadmin", "admin"]);
    expect(await bcrypt.compare(ENV.SUPERADMIN_PASSWORD, String(users[0].passwordHash))).toBe(true);
    expect(JSON.stringify(results)).not.toMatch(/passwordHash|\$2[aby]\$/);
    expect(JSON.stringify(results)).not.toContain(ENV.SUPERADMIN_PASSWORD);
    expect(log).not.toHaveBeenCalled();
    expect(state.db!.collection("audit_logs").docs).toHaveLength(2);
  });

  it("is idempotent and never resets passwords on rerun", async () => {
    await provisionPrivilegedAccounts(state.db as never, accounts(), { bcryptRounds: 4 });
    const hashBefore = state.db!.collection("users").docs[0].passwordHash;
    const changed = readPrivilegedAccountsFromEnv({ ...ENV, SUPERADMIN_PASSWORD: "N3w!Different#Pass" }).accounts;
    const again = await provisionPrivilegedAccounts(state.db as never, changed, { bcryptRounds: 4 });
    expect(again.map((r) => r.status)).toEqual(["exists", "exists"]);
    expect(state.db!.collection("users").docs).toHaveLength(2);
    expect(state.db!.collection("users").docs[0].passwordHash).toBe(hashBefore);
  });

  it("never elevates an existing ordinary account with a configured email", async () => {
    state.db!.collection("users").docs.push({ _id: new ObjectId(), email: "ops@example.com", passwordHash: "user-hash", name: "Someone" });
    const results = await provisionPrivilegedAccounts(state.db as never, accounts(), { bcryptRounds: 4 });
    expect(results.find((r) => r.email === "ops@example.com")?.status).toBe("conflict");
    const ops = state.db!.collection("users").docs.find((u) => u.email === "ops@example.com")!;
    expect(ops.role).toBeUndefined();
    expect(ops.passwordHash).toBe("user-hash");
  });

  it("handles a concurrent bootstrap run (duplicate key) gracefully", async () => {
    const users = state.db!.collection("users");
    const realFind = users.findOne.bind(users);
    // First lookup misses, as if another process inserts right after.
    let first = true;
    users.findOne = (async (filter: Record<string, unknown>) => {
      if (first) {
        first = false;
        await users.insertOne({ email: "root@example.com", role: "superadmin", provisionedBy: "env-bootstrap" });
        return null;
      }
      return realFind(filter);
    }) as typeof users.findOne;
    const results = await provisionPrivilegedAccounts(state.db as never, accounts().slice(0, 1), { bcryptRounds: 4 });
    expect(results[0].status).toBe("exists");
    expect(users.docs.filter((u) => u.email === "root@example.com")).toHaveLength(1);
  });
});

describe("authorization policy", () => {
  it("maps legacy flags and explicit roles", () => {
    expect(roleFromDoc({ isAdmin: true })).toBe("admin");
    expect(roleFromDoc({ isAdmin: true, role: "user" })).toBe("user");
    expect(can("admin", "contests.manage")).toBe(true);
    expect(can("admin", "users.manageRoles")).toBe(false);
    expect(can("superadmin", "users.manageRoles")).toBe(true);
  });

  it("returns 401/403 for unauthenticated and ordinary users", async () => {
    expect((await listUsers(jsonRequest("/api/admin/users"))).status).toBe(401);
    state.user = { ...addUser(), isAdmin: true }; // token claim says admin; database says user
    expect((await listUsers(jsonRequest("/api/admin/users"))).status).toBe(403);
    expect((await patchRole(addUser().id, "admin")).status).toBe(403);
  });

  it("lets admins list users without emails, but not change roles", async () => {
    addUser();
    state.user = addUser("admin");
    const data = (await (await listUsers(jsonRequest("/api/admin/users"))).json()) as { users: Array<Record<string, unknown>>; canManageRoles: boolean };
    expect(data.canManageRoles).toBe(false);
    expect(data.users.every((u) => !("email" in u))).toBe(true);
    expect((await patchRole(addUser().id, "superadmin")).status).toBe(403);
  });

  it("lets superadmins change roles with an audit trail, but not their own or the last superadmin", async () => {
    const target = addUser();
    state.user = addUser("superadmin");
    const res = await patchRole(target.id, "admin");
    expect(res.status).toBe(200);
    expect(state.db!.collection("users").docs.find((u) => String(u._id) === target.id)?.role).toBe("admin");
    expect(state.db!.collection("audit_logs").docs.at(-1)).toMatchObject({ action: "user.role_changed", actorId: state.user.id, targetId: target.id, details: { from: "user", to: "admin" } });

    expect((await patchRole(state.user.id, "user")).status).toBe(403);
    expect((await patchRole(target.id, "owner")).status).toBe(400);
    expect((await patchRole(new ObjectId().toString(), "admin")).status).toBe(404);

    const other = addUser("superadmin");
    state.user = other;
    // Two superadmins exist: demoting one is allowed.
    const first = state.db!.collection("users").docs.find((u) => u.role === "superadmin" && String(u._id) !== other.id)!;
    expect((await patchRole(String(first._id), "admin")).status).toBe(200);
    // Now "other" is the last one; another superadmin can't exist to demote it, and self-demotion is blocked.
    expect((await patchRole(other.id, "user")).status).toBe(403);
  });

  it("revokes privileges immediately after a downgrade, even with an old token", async () => {
    const admin = addUser("admin");
    state.user = { ...admin, isAdmin: true };
    expect(await isAdminInDb(state.db as never, admin.id)).toBe(true);
    state.db!.collection("users").docs.find((u) => String(u._id) === admin.id)!.role = "user";
    expect(await isAdminInDb(state.db as never, admin.id)).toBe(false);
    const res = await createContest(jsonRequest("/api/contests", { name: "X", startDate: new Date().toISOString(), endDate: new Date(Date.now() + 86_400_000).toISOString() }));
    expect(res.status).toBe(403);
  });

  it("ignores role fields submitted during signup", async () => {
    vi.stubEnv("JWT_SECRET", "x".repeat(40));
    const res = await signup(jsonRequest("/api/auth/signup", { name: "Eve", email: "eve@example.com", password: "password123", dob: "2000-01-01", role: "superadmin", isAdmin: true }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toMatch(/passwordHash/);
    const eve = state.db!.collection("users").docs.find((u) => u.email === "eve@example.com")!;
    expect(eve.role).toBeUndefined();
    expect(eve.isAdmin).toBeUndefined();
    vi.unstubAllEnvs();
  });
});

describe("secret hygiene", () => {
  it("keeps privileged variables out of the browser bundle namespace", async () => {
    const { readFileSync } = await import("node:fs");
    const example = readFileSync(".env.example", "utf8");
    expect(example).not.toMatch(/NEXT_PUBLIC_(ADMIN|SUPERADMIN)/);
    expect(example).toMatch(/^SUPERADMIN_PASSWORD=$/m);
    expect(example).toMatch(/^ADMIN_PASSWORD=$/m);
    // No real-looking Atlas credentials.
    expect(example).toMatch(/mongodb\+srv:\/\/USER:PASSWORD@cluster\.example\.mongodb\.net/);
  });
});
