"use client";

import { motion } from "framer-motion";
import { ArrowLeft, ClipboardList, FileDown, FileSpreadsheet } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth, useTableChanges, useTick } from "@/components/providers";
import { TaskCard, overdueText } from "@/components/task-card";
import { TaskDrawer } from "@/components/task-drawer";
import { TaskFormModal } from "@/components/task-form";
import { Avatar, Button, EmptyState, ErrorState, Field, Skeleton, StatCard, StatusBadge, cx, inputClass, stagger, staggerItem } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import { addDays, fmtDateTime, fmtDay, fmtHours, pkDate } from "@/lib/time";
import { downloadCsv, downloadPdf } from "@/lib/report";
import { countedHours, displayStatus, normalizeTask, type Profile, type Task } from "@/lib/types";

function weekStart(d: string) {
  const dow = new Date(`${d}T12:00:00+05:00`).getUTCDay(); // 0 = Sunday
  return addDays(d, -((dow + 6) % 7));
}

export default function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const today = pkDate();
  const [people, setPeople] = useState<Profile[]>([]);
  const [from, setFrom] = useState(() => weekStart(today));
  const [to, setTo] = useState(today);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Task | null>(null);
  const [exporting, setExporting] = useState(false);
  useTick();

  useEffect(() => {
    supabaseBrowser()
      .from("profiles")
      .select("*")
      .eq("role", "member")
      .order("full_name")
      .then(({ data }) => setPeople((data ?? []) as Profile[]));
  }, []);

  const load = useCallback(async () => {
    if (!from || !to) return;
    const { data, error: err } = await supabaseBrowser()
      .from("tasks")
      .select("*")
      .eq("user_id", id)
      .gte("task_date", from)
      .lte("task_date", to)
      .order("planned_start_at", { ascending: false });
    if (err) return setError(err.message);
    setError(null);
    setTasks((data as Task[]).map(normalizeTask));
  }, [id, from, to]);

  useEffect(() => {
    setTasks(null);
    load();
  }, [load]);
  useTableChanges(["tasks"], load);

  const member = people.find((p) => p.id === id);
  const stats = useMemo(() => {
    const list = tasks ?? [];
    const approved = list.filter((t) => t.status === "approved");
    const finished = list.filter((t) => t.status === "approved" || t.status === "submitted");
    return {
      total: list.length,
      hours: approved.reduce((s, t) => s + countedHours(t), 0),
      discarded: list.filter((t) => t.status === "discarded").length,
      planned: list.reduce((s, t) => s + t.estimated_hours, 0),
      onTime: finished.filter((t) => !t.completed_late).length,
      late: finished.filter((t) => t.completed_late).length,
      overdue: list.filter((t) => t.status === "overdue").length,
      approved: approved.length,
    };
  }, [tasks]);

  const presets = [
    { label: "Today", from: today, to: today },
    { label: "This week", from: weekStart(today), to: today },
    { label: "This month", from: today.slice(0, 8) + "01", to: today },
    { label: "Last 30 days", from: addDays(today, -29), to: today },
  ];
  const openTask = tasks?.find((t) => t.id === openId) ?? null;

  return (
    <div>
      <Link href="/admin/team" className="mb-4 inline-flex min-h-11 items-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink">
        <ArrowLeft size={15} /> Team
      </Link>

      <div className="mb-6 flex flex-col gap-4 sm:mb-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          {member ? <Avatar name={member.full_name} size={56} src={member.avatar_url} /> : <Skeleton className="h-[52px] w-[52px]" />}
          <div className="min-w-0">
            <h1 className="truncate text-[28px] font-semibold leading-tight">{member?.full_name ?? "Member"}</h1>
            <p className="truncate text-sm text-muted">
              {member ? `${member.title || "Member"}${member.is_active ? "" : " · Inactive"}` : "Loading"}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:flex sm:items-end">
          <Field label="Member" className="col-span-2 sm:w-52">
            {(p) => (
              <select {...p} className={inputClass} value={id} onChange={(e) => router.push(`/admin/team/${e.target.value}`)}>
                {people.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="From">
            {(p) => <input {...p} type="date" className={inputClass + " tnum"} value={from} max={to} onChange={(e) => setFrom(e.target.value)} />}
          </Field>
          <Field label="To">
            {(p) => <input {...p} type="date" className={inputClass + " tnum"} value={to} min={from} onChange={(e) => setTo(e.target.value)} />}
          </Field>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        {presets.map((p) => {
          const active = p.from === from && p.to === to;
          return (
            <button
              key={p.label}
              onClick={() => {
                setFrom(p.from);
                setTo(p.to);
              }}
              aria-pressed={active}
              className={cx(
                "min-h-11 rounded-full border px-4 text-[13px] font-medium transition-colors sm:min-h-9",
                active ? "border-accent bg-accent-tint text-ink" : "border-line-strong bg-surface text-muted hover:border-accent hover:text-ink",
              )}
            >
              {p.label}
            </button>
          );
        })}
        <div className="flex w-full gap-2 sm:ml-auto sm:w-auto">
          <Button
            variant="primary"
            size="sm"
            className="min-h-11 flex-1 sm:min-h-9 sm:flex-none"
            disabled={!member || tasks === null}
            loading={exporting}
            onClick={async () => {
              if (!member || !tasks) return;
              setExporting(true);
              try {
                await downloadPdf(member, [...tasks].reverse(), from, to);
              } finally {
                setExporting(false);
              }
            }}
          >
            <FileDown size={15} /> Download report (PDF)
          </Button>
          <Button
            size="sm"
            className="min-h-11 sm:min-h-9"
            disabled={!member || tasks === null}
            onClick={() => member && tasks && downloadCsv(member, [...tasks].reverse(), from, to)}
          >
            <FileSpreadsheet size={15} /> CSV
          </Button>
        </div>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : tasks === null ? (
        <div>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[112px]" />
            ))}
          </div>
          <Skeleton className="mt-8 h-[240px]" />
        </div>
      ) : (
        <>
          <motion.div key={`${id}-${from}-${to}`} variants={stagger} initial="hidden" animate="show" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <motion.div variants={staggerItem}>
              <StatCard primary label="Approved hours" value={stats.hours} decimals={2} suffix="h" context={`worked, of ${fmtHours(stats.planned)}h estimated`} />
            </motion.div>
            <motion.div variants={staggerItem}>
              <StatCard label="Tasks" value={stats.total} context={`${stats.approved} approved`} />
            </motion.div>
            <motion.div variants={staggerItem}>
              <StatCard label="On time" value={stats.onTime} context={stats.onTime + stats.late ? `${Math.round((stats.onTime / (stats.onTime + stats.late)) * 100)}% of completed` : "Nothing completed yet"} />
            </motion.div>
            <motion.div variants={staggerItem}>
              <StatCard label="Late" value={stats.late} tone="danger" context={`${stats.overdue} overdue · ${stats.discarded} discarded`} />
            </motion.div>
          </motion.div>

          <section className="mt-8">
            {tasks.length === 0 ? (
              <EmptyState icon={<ClipboardList size={20} />} title="No tasks in this period" body="Try a wider date range, or check whether this member planned any work on these days." />
            ) : (
              <>
                {/* Desktop: table */}
                <div className="card hidden overflow-hidden md:block">
                  <table className="w-full table-fixed text-left text-sm">
                    <thead>
                      <tr className="border-b border-line text-xs font-medium text-muted">
                        <th className="w-[32%] px-5 py-2.5 font-medium">Task</th>
                        <th className="w-[12%] px-3 py-2.5 font-medium">Date</th>
                        <th className="w-[16%] px-3 py-2.5 font-medium">Due</th>
                        <th className="w-[16%] px-3 py-2.5 font-medium">Completed</th>
                        <th className="w-[9%] px-3 py-2.5 text-right font-medium">Hours</th>
                        <th className="w-[15%] px-5 py-2.5 text-right font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tasks.map((t) => (
                        <tr
                          key={t.id}
                          onClick={() => setOpenId(t.id)}
                          onKeyDown={(e) => e.key === "Enter" && setOpenId(t.id)}
                          tabIndex={0}
                          className="cursor-pointer border-b border-line last:border-b-0 hover:bg-surface-2"
                        >
                          <td className="px-5 py-3">
                            <p className="truncate font-medium">{t.title}</p>
                            {t.status === "overdue" ? <p className="text-xs font-semibold text-danger tnum">{overdueText(t)}</p> : null}
                          </td>
                          <td className="px-3 py-3 text-muted tnum">{fmtDay(t.planned_start_at)}</td>
                          <td className="px-3 py-3 tnum">{fmtDateTime(t.due_at, true)}</td>
                          <td className={cx("px-3 py-3 tnum", t.completed_late ? "text-danger" : t.submitted_at ? "" : "text-muted")}>
                            {t.submitted_at ? fmtDateTime(t.submitted_at, true) : "-"}
                          </td>
                          <td className="px-3 py-3 text-right tnum">
                            {t.credited_hours != null ? `${fmtHours(t.credited_hours)} / ${fmtHours(t.estimated_hours)}` : fmtHours(t.estimated_hours)}
                          </td>
                          <td className="px-5 py-3">
                            <span className="flex justify-end">
                              <StatusBadge status={displayStatus(t)} late={t.completed_late} />
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Mobile: stacked cards */}
                <div className="flex flex-col gap-2.5 md:hidden">
                  {tasks.map((t) => (
                    <TaskCard key={t.id} task={t} onOpen={() => setOpenId(t.id)} />
                  ))}
                </div>
              </>
            )}
          </section>
        </>
      )}

      <TaskDrawer
        task={editing ? null : openTask}
        mode="admin"
        owner={member ?? null}
        currentUserId={profile!.id}
        onClose={() => setOpenId(null)}
        onChanged={load}
        onEdit={setEditing}
      />
      <TaskFormModal open={!!editing} task={editing} onClose={() => setEditing(null)} onSaved={load} userId={profile!.id} />
    </div>
  );
}
