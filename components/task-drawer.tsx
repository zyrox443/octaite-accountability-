"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, ExternalLink, FileText, Film, Link2, Pause, Pencil, Play, Trash2, UploadCloud, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { addProofLink, removeProof, signProofs, uploadProofFile, MAX_FILE_BYTES } from "@/lib/proofs";
import { supabaseBrowser } from "@/lib/supabase/client";
import { fmtBytes, fmtDateTime, fmtDuration, fmtHours } from "@/lib/time";
import { displayStatus, workedSeconds, type Profile, type Task, type TaskProof } from "@/lib/types";
import { overdueText } from "./task-card";
import { Avatar, Button, Drawer, Field, Skeleton, StatusBadge, cx, inputClass, useToast } from "./ui";

type Upload = { id: number; name: string; progress: number; error?: string };

// Unsent notes, kept per task so closing the drawer by accident loses nothing.
const noteDrafts = new Map<string, string>();

export function TaskDrawer({
  task,
  mode,
  owner,
  currentUserId,
  onClose,
  onChanged,
  onEdit,
}: {
  task: Task | null;
  mode: "member" | "admin";
  owner?: Pick<Profile, "full_name" | "title" | "avatar_url"> | null;
  currentUserId: string;
  onClose: () => void;
  onChanged: () => void;
  onEdit?: (t: Task) => void;
}) {
  const toast = useToast();
  const [proofs, setProofs] = useState<TaskProof[] | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [note, setNote] = useState("");
  const [link, setLink] = useState("");
  const [linkError, setLinkError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [busy, setBusy] = useState<"" | "submit" | "approve" | "reject" | "delete" | "link" | "timer">("");
  const [, setTick] = useState(0);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const taskId = task?.id;

  const loadProofs = useCallback(async (id: string) => {
    const { data } = await supabaseBrowser().from("task_proofs").select("*").eq("task_id", id).order("created_at");
    const list = (data ?? []) as TaskProof[];
    setProofs(list);
    setUrls(await signProofs(list));
  }, []);

  useEffect(() => {
    setProofs(null);
    setUrls({});
    setUploads([]);
    setLink("");
    setLinkError("");
    setSubmitError("");
    setRejecting(false);
    setReason("");
    setReasonError("");
    setConfirmDelete(false);
    setNote(taskId ? (noteDrafts.get(taskId) ?? "") : "");
    if (taskId) loadProofs(taskId);
  }, [taskId, loadProofs]);

  // Live timer display while the task is running.
  const running = !!task?.started_at;
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  async function toggleTimer() {
    if (!task) return;
    setBusy("timer");
    const { error } = await supabaseBrowser().rpc(task.started_at ? "pause_task" : "start_task", { p_task_id: task.id });
    setBusy("");
    if (error) return toast({ title: task.started_at ? "Could not pause" : "Could not start", body: error.message, tone: "error" });
    setSubmitError("");
    onChanged();
  }

  const isOwner = !!task && task.user_id === currentUserId;
  const canSubmit = !!task && isOwner && (task.status === "pending" || task.status === "overdue");
  const canReview = !!task && mode === "admin" && task.status === "submitted";
  const ds = task ? displayStatus(task) : "pending";

  async function handleFiles(files: FileList | File[]) {
    if (!task) return;
    for (const file of Array.from(files)) {
      const id = Date.now() + Math.random();
      if (file.size > MAX_FILE_BYTES) {
        setUploads((u) => [...u, { id, name: file.name, progress: 0, error: "Larger than 50 MB. Add it as a link instead." }]);
        continue;
      }
      setUploads((u) => [...u, { id, name: file.name, progress: 0 }]);
      try {
        await uploadProofFile(file, currentUserId, task.id, (f) =>
          setUploads((u) => u.map((x) => (x.id === id ? { ...x, progress: f } : x))),
        );
        setUploads((u) => u.filter((x) => x.id !== id));
        setSubmitError("");
        await loadProofs(task.id);
      } catch (err) {
        setUploads((u) => u.map((x) => (x.id === id ? { ...x, error: (err as Error).message } : x)));
      }
    }
  }

  async function addLink() {
    if (!task) return;
    let value = link.trim();
    if (value && !/^https?:\/\//i.test(value)) value = `https://${value}`;
    try {
      const u = new URL(value);
      if (!u.hostname.includes(".")) throw new Error();
    } catch {
      setLinkError("Enter a valid link, for example https://drive.google.com/...");
      return;
    }
    setBusy("link");
    try {
      await addProofLink(value, currentUserId, task.id);
      setLink("");
      setLinkError("");
      setSubmitError("");
      await loadProofs(task.id);
    } catch (err) {
      setLinkError((err as Error).message);
    }
    setBusy("");
  }

  async function submit() {
    if (!task) return;
    if (workedSeconds(task) <= 0) {
      setSubmitError("Start the task first so your working time is recorded.");
      return;
    }
    if (!proofs || proofs.length === 0) {
      setSubmitError("Attach at least one file or link as proof of work.");
      return;
    }
    if (!note.trim()) {
      setSubmitError("Add a short note describing what was done.");
      return;
    }
    if (uploads.some((u) => !u.error)) {
      setSubmitError("Wait for the uploads to finish.");
      return;
    }
    setBusy("submit");
    const { error } = await supabaseBrowser().rpc("submit_task", { p_task_id: task.id, p_note: note });
    setBusy("");
    if (error) {
      setSubmitError(error.message);
      return;
    }
    noteDrafts.delete(task.id);
    toast({ title: "Submitted for approval", body: task.title, tone: "success" });
    onChanged();
    onClose();
  }

  async function approve() {
    if (!task) return;
    setBusy("approve");
    const { error } = await supabaseBrowser().rpc("approve_task", { p_task_id: task.id });
    setBusy("");
    if (error) return toast({ title: "Could not approve", body: error.message, tone: "error" });
    toast({ title: "Task approved", body: task.title, tone: "success" });
    onChanged();
    onClose();
  }

  async function reject() {
    if (!task) return;
    if (!reason.trim()) {
      setReasonError("Give a reason so the member knows what to fix.");
      return;
    }
    setBusy("reject");
    const { error } = await supabaseBrowser().rpc("reject_task", { p_task_id: task.id, p_reason: reason });
    setBusy("");
    if (error) return setReasonError(error.message);
    toast({ title: "Task rejected", body: "The member has been notified.", tone: "info" });
    onChanged();
    onClose();
  }

  async function deleteTask() {
    if (!task) return;
    setBusy("delete");
    const sb = supabaseBrowser();
    const paths = (proofs ?? []).filter((p) => p.storage_path).map((p) => p.storage_path!);
    const { error } = await sb.from("tasks").delete().eq("id", task.id);
    setBusy("");
    if (error) return toast({ title: "Could not delete", body: error.message, tone: "error" });
    if (paths.length) await sb.storage.from("proofs").remove(paths);
    toast({ title: "Task deleted", tone: "info" });
    onChanged();
    onClose();
  }

  const footer = !task ? null : rejecting ? (
    <>
      <Button onClick={() => setRejecting(false)}>Back</Button>
      <Button variant="danger" onClick={reject} loading={busy === "reject"}>
        Reject and send back
      </Button>
    </>
  ) : confirmDelete ? (
    <>
      <span className="mr-auto self-center text-[13px] text-muted">Delete this task and its proof permanently?</span>
      <Button onClick={() => setConfirmDelete(false)}>Keep</Button>
      <Button variant="danger" onClick={deleteTask} loading={busy === "delete"}>
        Delete task
      </Button>
    </>
  ) : (
    <>
      {mode === "admin" ? (
        <div className="mr-auto flex gap-2">
          <Button size="sm" className="min-h-11" onClick={() => onEdit?.(task)}>
            <Pencil size={15} /> Edit
          </Button>
          <Button size="sm" variant="danger" className="min-h-11" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={15} /> Delete
          </Button>
        </div>
      ) : null}
      {canReview ? (
        <>
          <Button variant="danger" onClick={() => setRejecting(true)}>
            Reject
          </Button>
          <Button variant="primary" onClick={approve} loading={busy === "approve"}>
            <Check size={16} /> Approve
          </Button>
        </>
      ) : null}
      {canSubmit ? (
        <Button variant="primary" onClick={submit} loading={busy === "submit"}>
          Submit for approval
        </Button>
      ) : null}
    </>
  );

  const hasFooter = !!task && (mode === "admin" || canSubmit);

  return (
    <Drawer open={!!task} onClose={onClose} title={mode === "admin" && canReview ? "Review proof" : "Task details"} footer={hasFooter ? footer : undefined}>
      {task ? (
        <div className="flex flex-col gap-6">
          <div>
            {owner ? (
              <div className="mb-3 flex items-center gap-2.5">
                <Avatar name={owner.full_name} size={32} src={owner.avatar_url} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{owner.full_name}</p>
                  <p className="truncate text-xs text-muted">{owner.title}</p>
                </div>
              </div>
            ) : null}
            <h3 className="break-words text-xl font-semibold leading-snug">{task.title}</h3>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <StatusBadge status={ds} late={task.completed_late} />
              {task.status === "overdue" ? (
                <span className="inline-flex items-center gap-2 text-[13px] font-semibold text-danger tnum">
                  <span className="pulse-dot" aria-hidden /> {overdueText(task)}
                </span>
              ) : null}
            </div>
          </div>

          {canSubmit ? (
            <div
              className="flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between"
              style={running ? { borderColor: "var(--running)", background: "var(--success-tint)" } : { borderColor: "var(--line)", background: "var(--surface-2)" }}
            >
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: running ? "var(--running)" : "var(--muted)" }}>
                  {running ? <span className="live-dot" aria-hidden /> : null}
                  {running ? "Task running" : task.worked_seconds > 0 ? "Paused" : "Not started"}
                </p>
                <p className="mt-1 text-[28px] font-bold leading-none tracking-tight tnum">{fmtClock(workedSeconds(task))}</p>
                <p className="mt-1.5 text-xs text-muted">
                  {running
                    ? "Keep this app open. If you close it while the task is running, the task is discarded."
                    : "Only time on the timer counts for the leaderboard, up to the estimate."}
                </p>
              </div>
              <Button variant={running ? "secondary" : "primary"} onClick={toggleTimer} loading={busy === "timer"} className="flex-none">
                {running ? <Pause size={16} /> : <Play size={16} />}
                {running ? "Pause" : task.worked_seconds > 0 ? "Resume" : "Start task"}
              </Button>
            </div>
          ) : null}

          {task.status === "discarded" ? (
            <div className="rounded-2xl border border-line bg-surface-2 p-4" role="alert">
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">Discarded</p>
              <p className="mt-1 text-sm">
                The app was closed while this task was running, so it was discarded
                {task.discarded_at ? ` on ${fmtDateTime(task.discarded_at, true)}` : ""}. It earns no hours.
              </p>
            </div>
          ) : null}

          {task.rejection_reason && task.status !== "approved" && task.status !== "submitted" && task.status !== "discarded" ? (
            <div className="rounded-2xl border border-danger-line bg-danger-tint p-4" role="alert">
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-danger">Rejected by admin</p>
              <p className="mt-1 break-words text-sm text-ink">{task.rejection_reason}</p>
              {isOwner ? <p className="mt-1 text-[13px] text-muted">Fix the issue, update your proof and submit again.</p> : null}
            </div>
          ) : null}

          {task.description ? <p className="whitespace-pre-wrap break-words text-sm text-ink">{task.description}</p> : null}

          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line text-sm">
            <Meta label="Planned start" value={fmtDateTime(task.planned_start_at, true)} />
            <Meta label="Estimated hours" value={`${fmtHours(task.estimated_hours)}h`} />
            <Meta label="Due" value={fmtDateTime(task.due_at, true)} />
            <Meta
              label="Original due"
              value={fmtDateTime(task.original_due_at, true)}
              note={task.original_due_at !== task.due_at ? "Changed by admin" : undefined}
            />
            {task.submitted_at ? (
              <Meta
                label="Completed"
                value={fmtDateTime(task.submitted_at, true)}
                note={
                  task.completed_late
                    ? `${fmtDuration(Math.max(0, new Date(task.submitted_at).getTime() - new Date(task.due_at).getTime()))} late`
                    : "On time"
                }
                danger={task.completed_late}
              />
            ) : null}
            {task.credited_hours != null ? (
              <Meta label="Hours counted" value={`${fmtHours(task.credited_hours)}h`} note={`${fmtDuration(task.worked_seconds * 1000)} on the timer`} />
            ) : null}
            {task.approved_at ? <Meta label="Approved" value={fmtDateTime(task.approved_at, true)} /> : null}
          </dl>

          {task.submission_note && task.status !== "pending" && task.status !== "overdue" ? (
            <div>
              <h4 className="text-[13px] font-medium text-muted">Note from member</h4>
              <p className="mt-1 whitespace-pre-wrap break-words border-l-2 border-line-strong pl-3 text-sm">{task.submission_note}</p>
            </div>
          ) : null}

          <div>
            <h4 className="mb-2 text-base font-semibold">Proof of work</h4>
            {proofs === null ? (
              <div className="grid grid-cols-3 gap-2">
                <Skeleton className="aspect-square" />
                <Skeleton className="aspect-square" />
              </div>
            ) : proofs.length === 0 && !canSubmit ? (
              <p className="rounded-2xl border border-dashed border-line-strong px-4 py-6 text-center text-sm text-muted">No proof has been added yet.</p>
            ) : (
              <ProofList
                proofs={proofs}
                urls={urls}
                onRemove={
                  canSubmit
                    ? async (p) => {
                        try {
                          await removeProof(p);
                          await loadProofs(task.id);
                        } catch (err) {
                          toast({ title: "Could not remove", body: (err as Error).message, tone: "error" });
                        }
                      }
                    : undefined
                }
              />
            )}

            {canSubmit ? (
              <div className="mt-4 flex flex-col gap-4">
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
                  }}
                  onClick={() => fileInput.current?.click()}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && fileInput.current?.click()}
                  role="button"
                  tabIndex={0}
                  className={cx(
                    "flex cursor-pointer flex-col items-center border border-dashed px-4 py-8 text-center transition-colors",
                    dragging ? "border-accent bg-accent-tint" : "border-line-strong bg-surface-2 hover:border-accent",
                  )}
                >
                  <UploadCloud size={20} className="text-muted" />
                  <p className="mt-2 text-sm font-medium">Drop files here or click to browse</p>
                  <p className="mt-1 text-xs text-muted">Images, PDF, documents or short video. Up to 50 MB each.</p>
                  <input
                    ref={fileInput}
                    type="file"
                    multiple
                    className="hidden"
                    accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
                    onChange={(e) => {
                      if (e.target.files?.length) handleFiles(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </div>

                <AnimatePresence initial={false}>
                  {uploads.map((u) => (
                    <motion.div key={u.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="rounded-2xl border border-line p-3">
                      <div className="flex items-center justify-between gap-3 text-[13px]">
                        <span className="truncate">{u.name}</span>
                        {u.error ? (
                          <button aria-label="Dismiss" onClick={() => setUploads((list) => list.filter((x) => x.id !== u.id))} className="text-muted hover:text-ink">
                            <X size={14} />
                          </button>
                        ) : (
                          <span className="text-muted tnum">{Math.round(u.progress * 100)}%</span>
                        )}
                      </div>
                      {u.error ? (
                        <p className="mt-1 text-[13px] text-danger">{u.error}</p>
                      ) : (
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={Math.round(u.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
                          <div className="h-full rounded-full bg-accent transition-[width] duration-150" style={{ width: `${u.progress * 100}%` }} />
                        </div>
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>

                <Field label="Or add a link" error={linkError} hint="For large files on Google Drive, YouTube, Frame.io and similar.">
                  {(p) => (
                    <div className="flex gap-2">
                      <input
                        {...p}
                        className={inputClass}
                        value={link}
                        onChange={(e) => setLink(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addLink();
                          }
                        }}
                        placeholder="https://"
                        inputMode="url"
                      />
                      <Button onClick={addLink} loading={busy === "link"} disabled={!link.trim()}>
                        Add
                      </Button>
                    </div>
                  )}
                </Field>

                <Field label="What was done" hint="A short note for the admin.">
                  {(p) => <textarea {...p} rows={3} className={inputClass} value={note} onChange={(e) => {
                    setNote(e.target.value);
                    if (taskId) noteDrafts.set(taskId, e.target.value);
                  }} />}
                </Field>
                {submitError ? (
                  <p role="alert" className="text-[13px] text-danger">
                    {submitError}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          {rejecting ? (
            <Field label="Reason for rejection" error={reasonError}>
              {(p) => <textarea {...p} rows={3} autoFocus className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What needs to change before this can be approved?" />}
            </Field>
          ) : null}
        </div>
      ) : null}
    </Drawer>
  );
}

function fmtClock(total: number) {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function Meta({ label, value, note, danger }: { label: string; value: string; note?: string; danger?: boolean }) {
  return (
    <div className="bg-surface p-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 font-medium tnum">{value}</dd>
      {note ? <dd className={cx("mt-0.5 text-xs tnum", danger ? "font-semibold text-danger" : "text-muted")}>{note}</dd> : null}
    </div>
  );
}

export function ProofList({
  proofs,
  urls,
  onRemove,
}: {
  proofs: TaskProof[];
  urls: Record<string, string>;
  onRemove?: (p: TaskProof) => void;
}) {
  const images = proofs.filter((p) => p.kind === "file" && p.mime_type?.startsWith("image/"));
  const others = proofs.filter((p) => !(p.kind === "file" && p.mime_type?.startsWith("image/")));
  if (!proofs.length) return null;
  return (
    <div className="flex flex-col gap-2">
      {images.length ? (
        <div className="grid grid-cols-3 gap-2">
          {images.map((p) => {
            const url = urls[p.storage_path!];
            return (
              <div key={p.id} className="group relative aspect-square overflow-hidden rounded-2xl border border-line bg-surface-2">
                {url ? (
                  <a href={url} target="_blank" rel="noreferrer" title={p.file_name ?? ""}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={p.file_name ?? "Proof image"} className="h-full w-full object-cover" />
                  </a>
                ) : (
                  <Skeleton className="h-full w-full border-0" />
                )}
                {onRemove ? (
                  <button
                    aria-label={`Remove ${p.file_name}`}
                    onClick={() => onRemove(p)}
                    className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-full border border-line bg-surface text-ink shadow-sm"
                  >
                    <X size={14} />
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
      {others.map((p) => {
        const href = p.kind === "link" ? p.url! : urls[p.storage_path!];
        const video = p.mime_type?.startsWith("video/");
        return (
          <div key={p.id} className="flex items-center gap-3 overflow-hidden rounded-2xl border border-line bg-surface">
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-12 min-w-0 flex-1 items-center gap-3 px-3 py-2 hover:bg-surface-2"
            >
              <span className="flex h-8 w-8 flex-none items-center justify-center rounded-2xl border border-line bg-surface-2 text-muted">
                {p.kind === "link" ? <Link2 size={16} /> : video ? <Film size={16} /> : <FileText size={16} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{p.kind === "link" ? p.url : p.file_name}</span>
                <span className="block text-xs text-muted tnum">{p.kind === "link" ? "Link" : fmtBytes(p.size_bytes)}</span>
              </span>
              <ExternalLink size={15} className="flex-none text-muted" />
            </a>
            {onRemove ? (
              <button aria-label="Remove proof" onClick={() => onRemove(p)} className="flex h-11 w-11 flex-none items-center justify-center text-muted hover:text-danger">
                <X size={16} />
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
