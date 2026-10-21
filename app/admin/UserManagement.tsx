"use client";

import { useState } from "react";
import { Users } from "lucide-react";

import { Alert, Badge, Button, Card, CardBody, CardHeader, ConfirmDialog, ErrorState, Input, LoadingState, Select } from "@/app/components/ui";
import { formatDate } from "@/app/lib/format";
import { useApi } from "@/app/lib/useApi";

type Role = "user" | "admin" | "superadmin";
type Row = { id: string; name: string; email?: string; role: Role; createdAt: string | null; isSelf: boolean };
type Directory = { users: Row[]; canManageRoles: boolean; viewerRole: Role; page: number; totalPages: number };

const ROLE_TONE = { user: "neutral", admin: "info", superadmin: "accent" } as const;

/** Account directory. Role changes are offered to superadmins only (and enforced by the API). */
export default function UserManagement() {
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [page, setPage] = useState(1);
  const dir = useApi<Directory>(`/api/admin/users?q=${encodeURIComponent(submitted)}&page=${page}`);
  const [pending, setPending] = useState<{ user: Row; role: Role } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  async function applyRole() {
    if (!pending) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/users/${pending.user.id}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: pending.role }),
      });
      const data = (await res.json().catch(() => null)) as { ok: boolean; error?: string } | null;
      setMsg(res.ok && data?.ok ? { tone: "success", text: `${pending.user.name || pending.user.email} is now ${pending.role}.` } : { tone: "error", text: data?.error || "Role change failed." });
      if (res.ok) dir.reload();
    } catch {
      setMsg({ tone: "error", text: "Could not reach the server." });
    } finally {
      setBusy(false);
      setPending(null);
    }
  }

  return (
    <Card className="mt-6">
      <CardHeader
        title="Accounts"
        description={dir.data?.canManageRoles ? "Change roles carefully: every change is recorded in the audit log." : "Superadmins can change roles."}
        icon={<Users className="size-4" />}
      />
      <CardBody className="grid gap-4">
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setSubmitted(query.trim());
          }}
        >
          <label htmlFor="user-search" className="sr-only">
            Search accounts
          </label>
          <Input id="user-search" placeholder={dir.data?.canManageRoles ? "Search by name or email" : "Search by name"} value={query} onChange={(e) => setQuery(e.target.value)} />
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>
        {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
        {dir.loading ? <LoadingState rows={2} label="Loading accounts…" /> : null}
        {dir.error ? <ErrorState description={dir.error} onRetry={dir.reload} /> : null}
        {dir.data ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-sm">
              <caption className="sr-only">Accounts</caption>
              <thead className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="py-2 pr-3">Name</th>
                  {dir.data.canManageRoles ? <th scope="col" className="py-2 pr-3">Email</th> : null}
                  <th scope="col" className="py-2 pr-3">Joined</th>
                  <th scope="col" className="py-2">Role</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {dir.data.users.map((u) => (
                  <tr key={u.id}>
                    <td className="py-2.5 pr-3 font-medium text-text">
                      {u.name || "—"}
                      {u.isSelf ? <span className="ml-1.5 text-xs text-muted">(you)</span> : null}
                    </td>
                    {dir.data!.canManageRoles ? <td className="py-2.5 pr-3 text-muted">{u.email}</td> : null}
                    <td className="py-2.5 pr-3 text-muted">{formatDate(u.createdAt)}</td>
                    <td className="py-2.5">
                      {dir.data!.canManageRoles && !u.isSelf ? (
                        <>
                          <label htmlFor={`role-${u.id}`} className="sr-only">
                            Role for {u.name || u.email}
                          </label>
                          <Select id={`role-${u.id}`} value={u.role} className="h-8 w-36" onChange={(e) => setPending({ user: u, role: e.target.value as Role })}>
                            <option value="user">user</option>
                            <option value="admin">admin</option>
                            <option value="superadmin">superadmin</option>
                          </Select>
                        </>
                      ) : (
                        <Badge tone={ROLE_TONE[u.role]}>{u.role}</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {dir.data.totalPages > 1 ? (
              <div className="mt-3 flex items-center justify-between text-sm">
                <span className="text-muted">
                  Page {dir.data.page} of {dir.data.totalPages}
                </span>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    Previous
                  </Button>
                  <Button size="sm" variant="secondary" disabled={page >= dir.data.totalPages} onClick={() => setPage((p) => p + 1)}>
                    Next
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </CardBody>
      <ConfirmDialog
        open={Boolean(pending)}
        title="Change role?"
        description={pending ? `Set ${pending.user.name || pending.user.email} to “${pending.role}”. This takes effect immediately and is audit-logged.` : undefined}
        confirmLabel="Change role"
        tone={pending?.role === "user" ? "danger" : "primary"}
        loading={busy}
        onConfirm={applyRole}
        onCancel={() => setPending(null)}
      />
    </Card>
  );
}
