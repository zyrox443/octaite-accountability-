"use client";

import { motion } from "framer-motion";
import { ArrowRight, CalendarX, CircleCheck, Plus } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth, useTableChanges, useTick } from "@/components/providers";
import { TaskCard, overdueText } from "@/components/task-card";
import { TaskDrawer } from "@/components/task-drawer";
import { TaskFormModal } from "@/components/task-form";
import { Avatar, Button, ErrorState, PageHeader, SectionTitle, Skeleton, StatCard, cx, stagger, staggerItem } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import { fmtDateTime, fmtHours, fmtLongDay, pkDate, pkHM } from "@/lib/time";
import { normalizeTask, type Profile, type Settings, type Task } from "@/lib/types";

function fmtCutoff(c: string) {
  const [h, m] = c.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

export default function AdminDashboard() {
  const { profile } = useAuth();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [people, setPeople] = useState<Profile[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Task | null>(null);
  const [adding, setAdding] = useState(false);
  useTick();

  const load = useCallback(async () => {
    const sb = supabaseBrowser();
    await sb.rpc("mark_overdue_tasks");
    const today = pkDate();
    const [t, p, s] = await Promise.all([
      sb.from("tasks").select("*").or(`task_date.eq.${today},status.in.(overdue,submitted)`).order("due_at"),
      sb.from("profiles").select("*").order("full_name"),
      sb.from("settings").select("*").eq("id", 1).single(),
    ]);
    const err = t.error || p.error || s.error;
    if (err) return setError(err.message);
    setError(null);
    setTasks((t.data as Task[]).map(normalizeTask));
    setPeople(p.data as Profile[]);
    setSettings(s.data as Settings);
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, [load]);
  useTableChanges(["tasks", "profiles"], load);

  const today = pkDate();
  const byId = useMemo(() => Object.fromEntries(people.map((p) => [p.id, p])), [people]);
  const members = people.filter((p) => p.role === "member" && p.is_active);
  const list = tasks ?? [];
  const overdue = list.filter((t) => t.status === "overdue").sort((a, b) => a.due_at.localeCompare(b.due_at));
  const awaiting = list.filter((t) => t.status === "submitted");
  const todays = list.filter((t) => t.task_date === today);
  const isoDow = ((new Date(`${today}T12:00:00+05:00`).getUTCDay() + 6) % 7) + 1;
  const pastCutoff = settings ? pkHM() >= settings.no_plan_cutoff.slice(0, 5) && settings.work_days.includes(isoDow) : false;
  const noPlan = members.filter((m) => !todays.some((t) => t.user_id === m.id));
  const openTask = list.find((t) => t.id === openId) ?? null;

  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={fmtLongDay()}
        actions={
          <Button onClick={() => setAdding(true)}>
            <Plus size={16} /> Assign task
          </Button>
        }
      />

      {tasks === null ? (
        <DashboardSkeleton />
      ) : (
        <>
          <motion.div variants={stagger} initial="hidden" animate="show" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <motion.div variants={staggerItem}>
              <StatCard primary tone="danger" label="Overdue now" value={overdue.length} context={overdue.length ? (new Set(overdue.map((t) => t.user_id)).size === 1 ? "From 1 person" : `Across ${new Set(overdue.map((t) => t.user_id)).size} people`) : "Everything is on track"} />
            </motion.div>
            <motion.div variants={staggerItem}>
              <StatCard label="Awaiting approval" value={awaiting.length} context={awaiting.length ? "Proof ready to review" : "Queue is clear"} />
            </motion.div>
            <motion.div variants={staggerItem}>
              <StatCard
                label="Completed today"
                value={todays.filter((t) => t.status === "approved").length}
                context={`of ${todays.length} planned`}
              />
            </motion.div>
            <motion.div variants={staggerItem}>
              <StatCard label="Hours planned today" value={todays.reduce((s, t) => s + t.estimated_hours, 0)} decimals={2} suffix="h" context={`${members.length - noPlan.length} of ${members.length} members planned`} />
            </motion.div>
          </motion.div>

          {/* Overdue panel */}
          <section className="mt-8 border border-danger-line bg-surface" aria-label="Overdue tasks">
            <div className="flex items-center justify-between border-b border-danger-line bg-danger-tint px-4 py-3 sm:px-5">
              <div className="flex items-center gap-2">
                {overdue.length ? <span className="pulse-dot" aria-hidden /> : null}
                <h2 className="text-lg font-semibold text-danger">Overdue</h2>
                <span className="border border-danger-line px-1.5 text-xs font-semibold text-danger tnum">{overdue.length}</span>
              </div>
            </div>
            {overdue.length === 0 ? (
              <p className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-muted">
                <CircleCheck size={16} className="text-success" /> No overdue tasks right now.
              </p>
            ) : (
              <motion.ul variants={stagger} initial="hidden" animate="show">
                {overdue.map((t) => (
                  <motion.li key={t.id} variants={staggerItem} className="border-b border-line last:border-b-0">
                    <button onClick={() => setOpenId(t.id)} className="flex w-full flex-col gap-1 px-4 py-3 text-left hover:bg-surface-2 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
                      <span className="flex min-w-0 items-center gap-2.5 sm:w-52 sm:flex-none">
                        <Avatar name={byId[t.user_id]?.full_name ?? "?"} size={28} />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{byId[t.user_id]?.full_name ?? "Unknown"}</span>
                          <span className="block truncate text-xs text-muted">{byId[t.user_id]?.title}</span>
                        </span>
                      </span>
                      <span className="min-w-0 flex-1 break-words text-sm">{t.title}</span>
                      <span className="flex-none text-[13px] text-muted tnum sm:w-40 sm:text-right">Due {fmtDateTime(t.due_at)}</span>
                      <span className="flex-none text-[13px] font-semibold text-danger tnum sm:w-36 sm:text-right">
                        {overdueText(t)}
                      </span>
                    </button>
                  </motion.li>
                ))}
              </motion.ul>
            )}
          </section>

          {/* No plan today */}
          {noPlan.length > 0 ? (
            <section
              className={cx("mt-4 flex flex-col gap-3 border p-4 sm:flex-row sm:items-center sm:px-5", pastCutoff ? "border-accent bg-accent-tint" : "border-line bg-surface")}
              aria-label="No plan today"
            >
              <div className="flex items-start gap-3 sm:w-64 sm:flex-none">
                <CalendarX size={18} className={cx("mt-0.5 flex-none", pastCutoff ? "text-accent-ink" : "text-muted")} />
                <div>
                  <h2 className="text-sm font-semibold">{pastCutoff ? "No plan today" : "Not planned yet"}</h2>
                  <p className="text-[13px] text-muted tnum">
                    {pastCutoff ? "No tasks logged by" : "Cutoff is"} {settings ? fmtCutoff(settings.no_plan_cutoff) : ""}
                  </p>
                </div>
              </div>
              <ul className="flex flex-wrap gap-2">
                {noPlan.map((m) => (
                  <li key={m.id}>
                    <Link href={`/admin/team/${m.id}`} className="lift flex min-h-11 items-center gap-2 border border-line bg-surface px-2.5">
                      <Avatar name={m.full_name} size={24} />
                      <span className="text-[13px] font-medium">{m.full_name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* Today overview */}
          <section className="mt-10">
            <SectionTitle>Today by member</SectionTitle>
            {members.length === 0 ? (
              <p className="border border-dashed border-line-strong bg-surface px-4 py-8 text-center text-sm text-muted">
                No active members yet. Add your team on the <Link href="/admin/team" className="font-medium text-accent-ink underline underline-offset-4">Team page</Link>.
              </p>
            ) : (
              <motion.div variants={stagger} initial="hidden" animate="show" className="grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
                {members.map((m) => {
                  const mine = todays.filter((t) => t.user_id === m.id);
                  const allOverdue = overdue.filter((t) => t.user_id === m.id).length;
                  const counts = [
                    { l: "Planned", v: mine.length },
                    { l: "Completed", v: mine.filter((t) => t.status === "approved").length },
                    { l: "Pending", v: mine.filter((t) => t.status === "pending" || t.status === "submitted").length },
                    { l: "Overdue", v: allOverdue, danger: true },
                  ];
                  const inReview = mine.filter((t) => t.status === "submitted").length;
                  return (
                    <motion.div key={m.id} variants={staggerItem}>
                      <Link href={`/admin/team/${m.id}`} className="lift block border border-line bg-surface p-4">
                        <div className="flex items-center gap-3">
                          <Avatar name={m.full_name} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold">{m.full_name}</p>
                            <p className="truncate text-xs text-muted">{m.title}</p>
                          </div>
                          <ArrowRight size={16} className="flex-none text-muted" />
                        </div>
                        <dl className="mt-4 grid grid-cols-4 gap-px border border-line bg-line">
                          {counts.map((c) => (
                            <div key={c.l} className="bg-surface px-1 py-2 text-center">
                              <dd className={cx("text-lg font-semibold leading-none tnum", c.danger && c.v > 0 && "text-danger")}>{c.v}</dd>
                              <dt className="mt-1 text-[11px] text-muted">{c.l}</dt>
                            </div>
                          ))}
                        </dl>
                        <p className="mt-3 text-xs text-muted tnum">
                          {mine.length === 0
                            ? "No tasks planned today"
                            : `${fmtHours(mine.reduce((s, t) => s + t.estimated_hours, 0))}h planned${inReview ? ` · ${inReview} awaiting approval` : ""}`}
                        </p>
                      </Link>
                    </motion.div>
                  );
                })}
              </motion.div>
            )}
          </section>

          {/* Approval preview */}
          <section className="mt-10">
            <div className="flex items-center justify-between">
              <SectionTitle count={awaiting.length}>Awaiting approval</SectionTitle>
              {awaiting.length ? (
                <Link href="/admin/approvals" className="mb-3 flex min-h-11 items-center gap-1 text-[13px] font-medium text-accent-ink">
                  Open queue <ArrowRight size={14} />
                </Link>
              ) : null}
            </div>
            {awaiting.length === 0 ? (
              <p className="border border-line bg-surface px-4 py-8 text-center text-sm text-muted">Nothing is waiting for your review.</p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {awaiting.slice(0, 4).map((t) => (
                  <TaskCard key={t.id} task={t} owner={byId[t.user_id]} onOpen={() => setOpenId(t.id)} actionLabel="Review" />
                ))}
              </div>
            )}
          </section>
        </>
      )}

      <TaskDrawer
        task={editing ? null : openTask}
        mode="admin"
        owner={openTask ? byId[openTask.user_id] : null}
        currentUserId={profile!.id}
        onClose={() => setOpenId(null)}
        onChanged={load}
        onEdit={setEditing}
      />
      <TaskFormModal open={!!editing} task={editing} onClose={() => setEditing(null)} onSaved={load} userId={profile!.id} />
      <TaskFormModal open={adding} onClose={() => setAdding(false)} onSaved={load} userId={members[0]?.id ?? profile!.id} members={members} />
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[112px]" />
        ))}
      </div>
      <Skeleton className="mt-8 h-[160px]" />
      <Skeleton className="mt-10 h-6 w-40" />
      <div className="mt-3 grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[156px]" />
        ))}
      </div>
    </div>
  );
}
