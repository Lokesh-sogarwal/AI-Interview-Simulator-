"use client";

import { useState } from "react";
import {
  Award,
  Briefcase,
  ExternalLink,
  FileSearch,
  FolderGit2,
  GraduationCap,
  Mic,
  RefreshCw,
  Sparkles,
  Trash2,
  Upload,
  UserRound,
  Wrench,
} from "lucide-react";

import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  LoadingState,
  PageContainer,
  PageHeader,
} from "@/app/components/ui";
import type { ParsedResume, SectionKey } from "@/lib/resumeParsing";
import { DEFAULT_DETAILS, loadDetails, saveDetails, saveInterviewId, saveResumeId, saveResumeText } from "@/app/lib/interviewStorage";
import { formatDate } from "@/app/lib/format";
import { useApi } from "@/app/lib/useApi";

const MAX_BYTES = 5 * 1024 * 1024;

type ResumeResult = {
  id: string | null;
  fileName: string;
  parsed: ParsedResume;
  warnings: string[];
  missingSections: SectionKey[];
  detectedSections: SectionKey[];
  source: "ai" | "ai+rules" | "rules";
  rawText?: string;
  persisted: boolean;
};

type Summary = { id: string; fileName: string; createdAt: string; projectCount: number; source: string; warnings: number };

const SECTION_LABEL: Record<SectionKey, string> = {
  summary: "Summary",
  skills: "Skills",
  experience: "Experience",
  projects: "Projects",
  education: "Education",
  certifications: "Certifications",
  achievements: "Achievements",
};

function dates(a?: string, b?: string) {
  return [a, b].filter(Boolean).join(" – ");
}

function href(link: string) {
  return /^https?:\/\//i.test(link) ? link : `https://${link}`;
}

function Chips({ items, empty }: { items: string[]; empty: string }) {
  if (!items.length) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((s, i) => (
        <li key={`${s}-${i}`}>
          <Badge tone="accent">{s}</Badge>
        </li>
      ))}
    </ul>
  );
}

function BulletList({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <ul className="mt-2 grid gap-1.5 text-sm text-text">
      {items.map((t, i) => (
        <li key={i} className="flex gap-2">
          <span className="mt-2 size-1.5 shrink-0 rounded-full bg-secondary" aria-hidden />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

/** Upload a resume, review exactly what was parsed (and what wasn't), and practise with it. */
export default function ResumeCheckerClient() {
  const history = useApi<{ resumes: Summary[] }>("/api/resume");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState("");
  const [busy, setBusy] = useState<"upload" | "reprocess" | "open" | null>(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ResumeResult | null>(null);
  const [rawText, setRawText] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<Summary | null>(null);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!file) {
      setFileError("Choose a PDF or .txt file first.");
      return;
    }
    setBusy("upload");
    try {
      const form = new FormData();
      form.set("resume", file);
      const res = await fetch("/api/resume", { method: "POST", body: form });
      const data = (await res.json().catch(() => null)) as (Omit<ResumeResult, "id"> & { ok: boolean; error?: string; resumeId: string | null; resumeText: string; filename: string }) | null;
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Your resume could not be processed.");
      setResult({ ...data, id: data.resumeId, fileName: data.filename });
      setRawText(data.resumeText);
      history.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function open(id: string) {
    setBusy("open");
    setError("");
    try {
      const res = await fetch(`/api/resume/${id}`);
      const data = (await res.json().catch(() => null)) as { ok: boolean; error?: string; resume?: ResumeResult & { rawText?: string } } | null;
      if (!res.ok || !data?.ok || !data.resume) throw new Error(data?.error || "Could not open that resume.");
      setResult({ ...data.resume, persisted: true });
      setRawText(data.resume.rawText ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open that resume.");
    } finally {
      setBusy(null);
    }
  }

  async function reprocess() {
    if (!result?.id) return;
    setBusy("reprocess");
    setError("");
    try {
      const res = await fetch(`/api/resume/${result.id}/reprocess`, { method: "POST" });
      const data = (await res.json().catch(() => null)) as { ok: boolean; error?: string; resume?: ResumeResult } | null;
      if (!res.ok || !data?.ok || !data.resume) throw new Error(data?.error || "Reprocessing failed.");
      setResult({ ...data.resume, persisted: true });
      history.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reprocessing failed.");
    } finally {
      setBusy(null);
    }
  }

  async function remove(item: Summary) {
    setConfirmDelete(null);
    const res = await fetch(`/api/resume/${item.id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) setError("Could not delete that resume.");
    if (result?.id === item.id) setResult(null);
    history.reload();
  }

  function practise() {
    if (!result) return;
    const p = result.parsed;
    const current = loadDetails() ?? DEFAULT_DETAILS;
    const skills = Array.from(new Set([...p.skills, ...p.projects.flatMap((x) => x.technologies)])).slice(0, 12);
    saveDetails({
      ...current,
      role: p.experience.find((x) => x.role)?.role || current.role,
      focusAreas: current.focusAreas || skills.join(", "),
      useResume: true,
    });
    saveResumeText(rawText || null);
    saveResumeId(result.id);
    saveInterviewId(null);
    window.location.href = "/interview/setup";
  }

  const p = result?.parsed;
  const partial = Boolean(result && (result.warnings.length > 0 || result.missingSections.length > 0));

  return (
    <PageContainer>
      <PageHeader
        title="Resume checker"
        description="See what an interviewer would learn from your resume (projects, skills, experience and education), then practise questions based on it."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Upload a resume" icon={<Upload className="size-4" />} />
          <CardBody>
            <form onSubmit={upload} className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end" noValidate>
              <Field label="Resume file" error={fileError} hint="PDF with selectable text, or .txt. Max 5 MB. The file isn’t stored; its text is saved to your account.">
                {({ id, describedBy, invalid }) => (
                  <Input
                    id={id}
                    type="file"
                    accept=".pdf,.txt,application/pdf,text/plain"
                    aria-describedby={describedBy}
                    aria-invalid={invalid}
                    className="h-auto py-2 file:mr-3 file:rounded-md file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary"
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      if (f && f.size > MAX_BYTES) {
                        setFileError("That file is larger than 5 MB.");
                        setFile(null);
                        e.target.value = "";
                        return;
                      }
                      setFileError("");
                      setFile(f);
                    }}
                  />
                )}
              </Field>
              <Button type="submit" loading={busy === "upload"} icon={<FileSearch className="size-4" aria-hidden />}>
                {busy === "upload" ? "Analysing…" : "Analyse"}
              </Button>
            </form>
            {error ? <Alert tone="error" className="mt-4">{error}</Alert> : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Your saved resumes" description="Open one to review it or reuse it in an interview." />
          <CardBody className="p-0">
            {history.loading ? <LoadingState className="p-5" rows={1} /> : null}
            {history.error ? <p className="px-5 py-4 text-sm text-muted">{history.error}</p> : null}
            {history.data && history.data.resumes.length === 0 ? <p className="px-5 py-4 text-sm text-muted">No saved resumes yet.</p> : null}
            <ul className="divide-y divide-border">
              {history.data?.resumes.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                  <button type="button" onClick={() => open(r.id)} className="min-w-0 text-left hover:underline" disabled={busy !== null}>
                    <span className="block truncate text-sm font-medium text-text">{r.fileName}</span>
                    <span className="block text-xs text-muted">
                      {formatDate(r.createdAt)} · {r.projectCount} project{r.projectCount === 1 ? "" : "s"}
                      {r.warnings ? ` · ${r.warnings} warning${r.warnings === 1 ? "" : "s"}` : ""}
                    </span>
                  </button>
                  <Button variant="ghost" size="sm" aria-label={`Delete ${r.fileName}`} onClick={() => setConfirmDelete(r)} icon={<Trash2 className="size-4" aria-hidden />} />
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>

      {busy === "upload" || busy === "open" ? <LoadingState className="mt-6" label="Reading your resume…" rows={3} /> : null}

      {!result && !busy ? (
        <EmptyState
          className="mt-6"
          icon={<FileSearch className="size-5" />}
          title="Your analysis will appear here"
          description="Upload a resume to see the projects, skills, experience and education it communicates, including anything that couldn’t be read."
        />
      ) : null}

      {result && p && busy !== "open" && busy !== "upload" ? (
        <div className="mt-6 grid gap-6">
          <Card>
            <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-lg font-semibold text-text">{p.name || result.fileName}</h2>
                  <Badge tone={partial ? "warning" : "success"}>{partial ? "Partial result" : "Fully parsed"}</Badge>
                  <Badge>{result.source === "rules" ? "Rule-based" : result.source === "ai" ? "AI-assisted" : "AI + rules"}</Badge>
                </div>
                <p className="mt-1 truncate text-sm text-muted">{[p.email, p.phone, result.fileName].filter(Boolean).join(" · ")}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {result.id ? (
                  <Button variant="secondary" onClick={reprocess} loading={busy === "reprocess"} icon={<RefreshCw className="size-4" aria-hidden />}>
                    Reprocess
                  </Button>
                ) : null}
                <Button onClick={practise} icon={<Mic className="size-4" aria-hidden />}>
                  Practise with this resume
                </Button>
              </div>
            </CardBody>
          </Card>

          {result.warnings.length || result.missingSections.length ? (
            <Alert tone="warning" title="Check these before you rely on the result">
              <ul className="grid gap-1">
                {result.warnings.map((w, i) => (
                  <li key={i}>• {w}</li>
                ))}
                {result.missingSections.length ? <li>• Not found in your resume: {result.missingSections.map((s) => SECTION_LABEL[s]).join(", ")}.</li> : null}
              </ul>
            </Alert>
          ) : null}

          <Card>
            <CardHeader title={`Projects (${p.projects.length})`} description="These become the starting points for resume-based questions." icon={<FolderGit2 className="size-4" />} />
            <CardBody>
              {p.projects.length ? (
                <ul className="grid gap-4">
                  {p.projects.map((pr, i) => (
                    <li key={`${pr.name}-${i}`} className="rounded-control border border-border p-4">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <h3 className="text-base font-semibold text-text">{pr.name}</h3>
                        {dates(pr.startDate, pr.endDate) ? <span className="text-xs text-muted">{dates(pr.startDate, pr.endDate)}</span> : null}
                      </div>
                      {pr.description ? <p className="mt-1.5 text-sm text-text">{pr.description}</p> : null}
                      <BulletList items={[...pr.responsibilities, ...pr.achievements]} />
                      {pr.technologies.length ? <div className="mt-3"><Chips items={pr.technologies} empty="" /></div> : null}
                      {pr.links.length ? (
                        <ul className="mt-3 flex flex-wrap gap-3 text-sm">
                          {pr.links.map((l, j) => (
                            <li key={j}>
                              <a href={href(l)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-text underline underline-offset-2">
                                {l.replace(/^https?:\/\//, "")} <ExternalLink className="size-3" aria-hidden />
                              </a>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {!pr.description && pr.responsibilities.length + pr.achievements.length === 0 ? (
                        <p className="mt-2 text-xs text-muted">Only the name was found. Add a sentence or two about what you built so questions can go deeper.</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">No projects were found. Interviewers often ask about projects; consider adding a “Projects” section with one title per project followed by bullet points.</p>
              )}
            </CardBody>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="Experience" icon={<Briefcase className="size-4" />} />
              <CardBody>
                {p.experience.length ? (
                  <ul className="grid gap-4">
                    {p.experience.map((e, i) => (
                      <li key={i}>
                        <p className="text-sm font-semibold text-text">{[e.role, e.company].filter(Boolean).join(" · ") || "Role"}</p>
                        {dates(e.startDate, e.endDate) ? <p className="text-xs text-muted">{dates(e.startDate, e.endDate)}</p> : null}
                        <BulletList items={[...e.responsibilities, ...e.achievements]} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted">No work experience found.</p>
                )}
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Education" icon={<GraduationCap className="size-4" />} />
              <CardBody>
                {p.education.length ? (
                  <ul className="grid gap-3">
                    {p.education.map((ed, i) => (
                      <li key={i}>
                        <p className="text-sm font-semibold text-text">{[ed.degree, ed.fieldOfStudy].filter(Boolean).join(", ") || "Education"}</p>
                        <p className="text-sm text-text">{ed.institution}</p>
                        <p className="text-xs text-muted">{[dates(ed.startDate, ed.endDate), ed.grade ? `Grade ${ed.grade}` : ""].filter(Boolean).join(" · ")}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted">No education found.</p>
                )}
              </CardBody>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title={`Skills (${p.skills.length})`} icon={<Wrench className="size-4" />} />
              <CardBody>
                <Chips items={p.skills} empty="No skills section found. List your languages, frameworks and tools explicitly." />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Summary" icon={<UserRound className="size-4" />} />
              <CardBody>{p.summary ? <p className="text-sm leading-6 text-text">{p.summary}</p> : <p className="text-sm text-muted">No summary found.</p>}</CardBody>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="Achievements" icon={<Award className="size-4" />} />
              <CardBody>{p.achievements.length ? <BulletList items={p.achievements} /> : <p className="text-sm text-muted">None found.</p>}</CardBody>
            </Card>
            <Card>
              <CardHeader title="Certifications" icon={<Sparkles className="size-4" />} />
              <CardBody>{p.certifications.length ? <BulletList items={p.certifications} /> : <p className="text-sm text-muted">None found.</p>}</CardBody>
            </Card>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title="Delete this resume?"
        description={confirmDelete ? `“${confirmDelete.fileName}” and its parsed data will be removed from your account.` : undefined}
        confirmLabel="Delete"
        tone="danger"
        onConfirm={() => confirmDelete && remove(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />
    </PageContainer>
  );
}
