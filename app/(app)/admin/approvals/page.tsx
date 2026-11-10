"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Inbox } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth, useTableChanges } from "@/components/providers";
import { TaskCard } from "@/components/task-card";
import { TaskDrawer } from "@/components/task-drawer";
import { TaskFormModal } from "@/components/task-form";
import { EmptyState, ErrorState, PageHeader, Skeleton } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import { normalizeTask, type Profile, type Task } from "@/lib/types";

export default function ApprovalsPage() {
  const { profile } = useAuth();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [people, setPeople] = useState<Profile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Task | null>(null);

  const load = useCallback(async () => {
    const sb = supabaseBrowser();
    const [t, p] = await Promise.all([
      sb.from("tasks").select("*").eq("status", "submitted").order("submitted_at"),
      sb.from("profiles").select("*"),
    ]);
    const err = t.error || p.error;
    if (err) return setError(err.message);
    setError(null);
    setTasks((t.data as Task[]).map(normalizeTask));
    setPeople(p.data as Profile[]);
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  useTableChanges(["tasks"], load);

  const byId = useMemo(() => Object.fromEntries(people.map((p) => [p.id, p])), [people]);
  const openTask = tasks?.find((t) => t.id === openId) ?? null;

  return (
    <div>
      <PageHeader title="Approvals" subtitle="Review the proof for each submitted task, then approve or reject it. Oldest first." />
      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : tasks === null ? (
        <div className="flex flex-col gap-2.5">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[108px]" />
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <EmptyState icon={<Inbox size={20} />} title="The approval queue is clear" body="New submissions appear here automatically as soon as a member uploads proof." />
      ) : (
        <div className="flex flex-col gap-2.5">
          <AnimatePresence initial={false}>
            {tasks.map((t, i) => (
              <motion.div
                key={t.id}
                layout="position"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0, transition: { duration: 0.25, delay: Math.min(i, 8) * 0.05 } }}
                exit={{ opacity: 0, x: 16, transition: { duration: 0.2 } }}
              >
                <TaskCard task={t} owner={byId[t.user_id]} onOpen={() => setOpenId(t.id)} actionLabel="Review proof" />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
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
    </div>
  );
}
