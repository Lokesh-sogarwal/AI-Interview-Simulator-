"use client";

import Link from "next/link";
import { useState } from "react";
import { CalendarPlus, Sparkles } from "lucide-react";

import UserManagement from "./UserManagement";

import { Alert, Button, Card, CardBody, CardHeader, Field, Input, PageContainer, PageHeader, Select, StatCard, Textarea } from "@/app/components/ui";
import { postJson } from "@/app/lib/useApi";

type Msg = { tone: "success" | "error"; text: string; href?: string } | null;

function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function Message({ msg }: { msg: Msg }) {
  if (!msg) return null;
  return (
    <Alert tone={msg.tone}>
      {msg.text}{" "}
      {msg.href ? (
        <Link href={msg.href} className="font-semibold underline underline-offset-2">
          Open contest
        </Link>
      ) : null}
    </Alert>
  );
}

export default function AdminPanel({ counts, role }: { counts: { contests: number; users: number; interviews: number }; role: "admin" | "superadmin" | "user" }) {
  const [daily, setDaily] = useState<{ busy: boolean; msg: Msg }>({ busy: false, msg: null });
  const [form, setForm] = useState(() => ({
    name: "",
    description: "",
    startDate: toLocalInput(new Date(Date.now() + 60 * 60 * 1000)),
    endDate: toLocalInput(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)),
    problemCount: "3",
    maxParticipants: "500",
    frequency: "weekly",
  }));
  const [create, setCreate] = useState<{ busy: boolean; msg: Msg; errors: Record<string, string> }>({ busy: false, msg: null, errors: {} });

  async function generateDaily() {
    setDaily({ busy: true, msg: null });
    const res = await postJson<{ contestId?: string; contest?: { name: string; problemSource?: string } }>("/api/admin/generate-daily-contest", {}).catch(() => null);
    setDaily({
      busy: false,
      msg: res?.ok
        ? { tone: "success", text: `Created “${res.data?.contest?.name}”.`, href: res.data?.contestId ? `/contests/${res.data.contestId}` : undefined }
        : { tone: "error", text: res?.data?.error || "Could not create the contest." },
    });
  }

  async function createContest(e: React.FormEvent) {
    e.preventDefault();
    const errors: Record<string, string> = {};
    if (!form.name.trim()) errors.name = "Enter a contest name.";
    const start = new Date(form.startDate);
    const end = new Date(form.endDate);
    if (Number.isNaN(start.getTime())) errors.startDate = "Choose a start time.";
    if (Number.isNaN(end.getTime()) || end <= start) errors.endDate = "The end must be after the start.";
    if (Object.keys(errors).length) {
      setCreate({ busy: false, msg: null, errors });
      return;
    }
    setCreate({ busy: true, msg: null, errors: {} });
    const res = await postJson<{ id?: string; problemCount?: number; problemSource?: string }>("/api/contests", {
      name: form.name.trim(),
      description: form.description,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      problemCount: Number(form.problemCount),
      maxParticipants: Number(form.maxParticipants),
      frequency: form.frequency,
    }).catch(() => null);
    setCreate({
      busy: false,
      errors: {},
      msg: res?.ok
        ? {
            tone: "success",
            text: `Contest created with ${res.data?.problemCount} problem(s)${res.data?.problemSource === "curated" ? " from the curated set (AI generation was unavailable)" : ""}.`,
            href: res.data?.id ? `/contests/${res.data.id}` : undefined,
          }
        : { tone: "error", text: res?.data?.error || "Could not create the contest." },
    });
  }

  return (
    <PageContainer>
      <PageHeader title={role === "superadmin" ? "Superadmin" : "Admin"} description="Create and manage coding contests and review accounts." />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Users" value={counts.users} />
        <StatCard label="Completed interviews" value={counts.interviews} />
        <StatCard label="Contests" value={counts.contests} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Card className="h-fit">
          <CardHeader title="Daily contest" description="One-click contest starting now and running for 7 days with 3 problems." icon={<Sparkles className="size-4" />} />
          <CardBody className="grid gap-3">
            <p className="text-sm text-muted">Problems are generated with AI when available; otherwise a curated set is used.</p>
            <Button onClick={generateDaily} loading={daily.busy}>
              Generate daily contest
            </Button>
            <Message msg={daily.msg} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Custom contest" icon={<CalendarPlus className="size-4" />} />
          <CardBody>
            <form onSubmit={createContest} className="grid gap-4 sm:grid-cols-2" noValidate>
              <Field label="Name" required error={create.errors.name} className="sm:col-span-2">
                {({ id, describedBy, invalid }) => <Input id={id} value={form.name} maxLength={120} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-describedby={describedBy} aria-invalid={invalid} />}
              </Field>
              <Field label="Description" hint="Optional" className="sm:col-span-2">
                {({ id }) => <Textarea id={id} rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />}
              </Field>
              <Field label="Starts" required error={create.errors.startDate}>
                {({ id, describedBy, invalid }) => <Input id={id} type="datetime-local" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} aria-describedby={describedBy} aria-invalid={invalid} />}
              </Field>
              <Field label="Ends" required error={create.errors.endDate}>
                {({ id, describedBy, invalid }) => <Input id={id} type="datetime-local" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} aria-describedby={describedBy} aria-invalid={invalid} />}
              </Field>
              <Field label="Problems">
                {({ id }) => (
                  <Select id={id} value={form.problemCount} onChange={(e) => setForm({ ...form, problemCount: e.target.value })}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Max participants">
                {({ id }) => <Input id={id} type="number" min={1} max={100000} value={form.maxParticipants} onChange={(e) => setForm({ ...form, maxParticipants: e.target.value })} />}
              </Field>
              <Field label="Frequency label">
                {({ id }) => (
                  <Select id={id} value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })}>
                    <option value="weekly">Weekly</option>
                    <option value="biweekly">Biweekly</option>
                  </Select>
                )}
              </Field>
              <div className="flex items-end sm:col-span-2">
                <Button type="submit" loading={create.busy}>
                  {create.busy ? "Generating problems…" : "Create contest"}
                </Button>
              </div>
              <div className="sm:col-span-2">
                <Message msg={create.msg} />
              </div>
            </form>
          </CardBody>
        </Card>
      </div>
      <UserManagement />
    </PageContainer>
  );
}
