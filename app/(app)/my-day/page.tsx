"use client";

import { motion } from "framer-motion";
import { CalendarCheck, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth, useTableChanges, useTick } from "@/components/providers";
import { TaskCard } from "@/components/task-card";
import { TaskDrawer } from "@/components/task-drawer";
import { TaskFormModal } from "@/components/task-form";
import { Button, EmptyState, ErrorState, PageHeader, SectionTitle, Skeleton, StatCard, stagger, staggerItem } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import { fmtHours, fmtLongDay, pkDate } from "@/lib/time";
import { normalizeTask, type Task } from "@/lib/types";

export default function MyDayPage() {
  const { profile } = useAuth();
  const uid = profile!.id;
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  useTick();

  const load = useCallback(async () => {
    const sb = supabaseBrowser();
    await sb.rpc("mark_overdue_tasks");
    const today = pkDate();
    const { data, error: err } = await sb
      .from("tasks")
      .select("*")
      .eq("user_id", uid)
      .or(`status.neq.approved,task_date.eq.${today}`)
      .order("due_at");
    if (err) return setError(err.message);
    setError(null);
    setTasks((data as Task[]).map(normalizeTask));
  }, [uid]);

  useEffect(() => {
    load();
    // Catch tasks that pass their due time while the page is open.
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, [load]);
  useTableChanges(["tasks"], load);

  const today = pkDate();
  const groups = useMemo(() => {
    const list = tasks ?? [];
    const isDue = (t: Task) =>
      t.status !== "approved" &&
      (t.status === "overdue" || !!t.went_overdue_at || (!!t.rejection_reason && t.status === "pending"));
    const due = list.filter(isDue);
    const todays = list.filter((t) => !isDue(t) && t.task_date === today);
    const other = list.filter((t) => !isDue(t) && t.task_date !== today);
    return { due, todays, other };
  }, [tasks, today]);

  const todayAll = (tasks ?? []).filter((t) => t.task_date === today);
  const stats = {
    planned: todayAll.length,
    hours: todayAll.reduce((s, t) => s + t.estimated_hours, 0),
    done: todayAll.filter((t) => t.status === "approved" || t.status === "submitted").length,
    approved: todayAll.filter((t) => t.status === "approved").length,
    overdue: (tasks ?? []).filter((t) => t.status === "overdue").length,
  };
  const openTask = tasks?.find((t) => t.id === openId) ?? null;
  const action = (t: Task) =>
    t.status === "pending" || t.status === "overdue" ? (t.rejection_reason ? "Resubmit proof" : "Submit proof") : "View";

  return (
    <div>
      <PageHeader
        title="My Day"
        subtitle={fmtLongDay()}
        actions={
          <Button variant="primary" onClick={() => setAdding(true)}>
            <Plus size={16} /> Add task
          </Button>
        }
      />

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : tasks === null ? (
        <MyDaySkeleton />
      ) : (
        <>
          <motion.div variants={stagger} initial="hidden" animate="show" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <motion.div variants={staggerItem}>
              <StatCard primary label="Planned today" value={stats.planned} context={`${fmtHours(stats.hours)}h estimated`} />
            </motion.div>
            <motion.div variants={staggerItem}>
              <StatCard label="Completed today" value={stats.done} context={`${stats.approved} approved`} />
            </motion.div>
            <motion.div variants={staggerItem}>
              <StatCard label="Still to do" value={todayAll.filter((t) => t.status === "pending").length} context="Pending today" />
            </motion.div>
            <motion.div variants={staggerItem}>
              <StatCard label="Overdue" value={stats.overdue} tone="danger" context={stats.overdue ? "Needs proof now" : "Nothing overdue"} />
            </motion.div>
          </motion.div>

          {groups.due.length > 0 ? (
            <section className="mt-8 border border-danger-line bg-surface p-4 sm:p-5">
              <SectionTitle tone="danger" count={groups.due.length}>
                My Due Tasks
              </SectionTitle>
              <p className="-mt-1 mb-4 text-[13px] text-muted">These stay here every day until they are completed and approved.</p>
              <TaskList tasks={groups.due} onOpen={setOpenId} action={action} />
            </section>
          ) : null}

          <section className="mt-8">
            <SectionTitle count={groups.todays.length}>Today</SectionTitle>
            {todayAll.length === 0 ? (
              <EmptyState
                icon={<CalendarCheck size={20} />}
                title="No tasks planned yet today"
                body="Add the tasks you plan to finish today, with an estimate and a due time for each."
                action={
                  <Button variant="primary" onClick={() => setAdding(true)}>
                    <Plus size={16} /> Add task
                  </Button>
                }
              />
            ) : groups.todays.length === 0 ? (
              <p className="border border-line bg-surface px-4 py-6 text-center text-sm text-muted">All of today&apos;s tasks are listed under My Due Tasks.</p>
            ) : (
              <TaskList tasks={groups.todays} onOpen={setOpenId} action={action} />
            )}
          </section>

          {groups.other.length > 0 ? (
            <section className="mt-8">
              <SectionTitle count={groups.other.length}>Other open tasks</SectionTitle>
              <TaskList tasks={groups.other} onOpen={setOpenId} action={action} />
            </section>
          ) : null}
        </>
      )}

      <TaskFormModal open={adding} onClose={() => setAdding(false)} onSaved={load} userId={uid} />
      <TaskDrawer task={openTask} mode="member" currentUserId={uid} onClose={() => setOpenId(null)} onChanged={load} />
    </div>
  );
}

function TaskList({ tasks, onOpen, action }: { tasks: Task[]; onOpen: (id: string) => void; action: (t: Task) => string }) {
  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="flex flex-col gap-2.5">
      {tasks.map((t) => (
        <motion.div key={t.id} variants={staggerItem} layout="position">
          <TaskCard task={t} onOpen={() => onOpen(t.id)} actionLabel={action(t)} />
        </motion.div>
      ))}
    </motion.div>
  );
}

function MyDaySkeleton() {
  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[112px]" />
        ))}
      </div>
      <Skeleton className="mt-8 h-6 w-24" />
      <div className="mt-3 flex flex-col gap-2.5">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[84px]" />
        ))}
      </div>
    </div>
  );
}
