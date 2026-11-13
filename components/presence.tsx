"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Pause, Siren, TriangleAlert } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useAuth, useNotifications, useTableChanges } from "./providers";
import { workedSeconds } from "@/lib/types";
import { Button, Modal, useToast } from "./ui";

type Running = { id: string; title: string; started_at: string | null; worked_seconds: number } | null;

/** Fire this after starting, pausing or submitting a task so the guard updates at once. */
export const TASKS_CHANGED = "tasks:changed";
export function announceTasksChanged() {
  window.dispatchEvent(new Event(TASKS_CHANGED));
}
const PresenceCtx = createContext<{ runningTask: Running }>({ runningTask: null });
export const usePresence = () => useContext(PresenceCtx);

const HEARTBEAT_MS = 30_000;

/**
 * - Tells the server "this person has the app open" every 30 seconds.
 * - Warns before the tab is closed while a task is running.
 * - Shows a blocking reminder (with siren) until the member acknowledges it.
 */
export function PresenceProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const uid = profile?.id;
  const [runningTask, setRunningTask] = useState<Running>(null);

  // Heartbeat. Background tabs still fire timers (at least once a minute),
  // so switching to another tab keeps the member online.
  useEffect(() => {
    if (!uid) return;
    const sb = supabaseBrowser();
    const beat = () => {
      sb.rpc("heartbeat").then(() => {});
    };
    beat();
    const id = setInterval(beat, HEARTBEAT_MS);
    const onVisible = () => document.visibilityState === "visible" && beat();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", beat);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", beat);
    };
  }, [uid]);

  const loadRunning = useCallback(async () => {
    if (!uid) return;
    const { data, error } = await supabaseBrowser()
      .from("tasks")
      .select("id,title,started_at,worked_seconds")
      .eq("user_id", uid)
      .not("started_at", "is", null)
      .limit(1);
    if (error) return;
    setRunningTask(data && data.length ? (data[0] as Running) : null);
  }, [uid]);
  // Three independent triggers, so the guard never depends on one of them:
  // the app's own announcement, live database updates, and a 15 second poll.
  useEffect(() => {
    loadRunning();
    window.addEventListener(TASKS_CHANGED, loadRunning);
    const id = setInterval(loadRunning, 15_000);
    return () => {
      window.removeEventListener(TASKS_CHANGED, loadRunning);
      clearInterval(id);
    };
  }, [loadRunning]);
  useTableChanges(["tasks"], loadRunning, !!uid);

  // Browser confirmation when closing or reloading the tab with a task running.
  // Browsers show their own fixed wording here; custom text is not allowed.
  const isRunning = !!runningTask;
  const [stayed, setStayed] = useState(false);
  const [armed, setArmed] = useState(true);

  useEffect(() => {
    if (!isRunning) {
      setStayed(false);
      return;
    }
    // Browsers only show the close confirmation on pages the person has
    // clicked or typed in since loading. If this page was just (re)opened
    // with a task already running, ask for one click so the guard is armed.
    const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
    setArmed(ua ? ua.hasBeenActive : true);

    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "A task is running. If you close the app it will be discarded.";
      // First confirmation is the browser's. If the person chooses to stay,
      // this timer fires and the app shows its own second warning.
      window.setTimeout(() => setStayed(true), 400);
      return e.returnValue;
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isRunning]);

  const toast = useToast();
  const [pausing, setPausing] = useState(false);
  async function pauseRunning() {
    if (!runningTask) return;
    setPausing(true);
    const { error } = await supabaseBrowser().rpc("pause_task", { p_task_id: runningTask.id });
    setPausing(false);
    if (error) return toast({ title: "Could not pause", body: error.message, tone: "error" });
    setStayed(false);
    toast({ title: "Task paused", body: "You can close the app now without losing it.", tone: "success" });
    loadRunning();
    announceTasksChanged();
  }

  const value = useMemo(() => ({ runningTask }), [runningTask]);
  return (
    <PresenceCtx.Provider value={value}>
      {children}

      {/* Shown once after a page load when a task is already running. */}
      <Modal open={isRunning && !armed} onClose={() => setArmed(true)} title="Your task is still running" width={440}
        footer={
          <Button variant="primary" onClick={() => setArmed(true)} autoFocus>
            Continue working
          </Button>
        }
      >
        <p className="text-sm">
          <span className="font-semibold">{runningTask?.title}</span> is running. Keep this tab open until you pause or submit it.
        </p>
        <p className="mt-2 text-[13px] text-muted">If you close the app while a task is running, the task is discarded.</p>
      </Modal>

      {/* Second warning, shown after the browser's own "Leave site?" prompt. */}
      <Modal
        open={isRunning && stayed}
        onClose={() => setStayed(false)}
        title="Do not close the app yet"
        width={480}
        footer={
          <>
            <Button onClick={pauseRunning} loading={pausing}>
              <Pause size={15} /> Pause task so I can leave
            </Button>
            <Button variant="primary" onClick={() => setStayed(false)} autoFocus>
              Keep working
            </Button>
          </>
        }
      >
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-danger-tint text-danger">
            <TriangleAlert size={20} />
          </span>
          <div>
            <p className="text-sm">
              <span className="font-semibold">{runningTask?.title}</span> is still running. If you close or leave the app now, this task
              will be <span className="font-semibold text-danger">discarded</span> and your admin will be notified.
            </p>
            <p className="mt-2 text-[13px] text-muted">Pause the task first if you need to step away. Your time so far is kept.</p>
          </div>
        </div>
      </Modal>

      <ReminderGate />
    </PresenceCtx.Provider>
  );
}

function clock(total: number) {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

/** Always-visible strip under the top bar while a task is running. */
export function RunningBar() {
  const { runningTask } = usePresence();
  const [, setTick] = useState(0);
  const on = !!runningTask;
  useEffect(() => {
    if (!on) return;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [on]);
  return (
    <AnimatePresence>
      {runningTask ? (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="mx-auto mt-3 w-full max-w-[1280px] px-4 sm:px-6 lg:px-8"
          role="status"
        >
          <div
            className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border px-4 py-2.5 text-[13px]"
            style={{ borderColor: "var(--running)", background: "var(--success-tint)" }}
          >
            <span className="live-dot" aria-hidden />
            <span className="font-semibold" style={{ color: "var(--running)" }}>
              Task running
            </span>
            <span className="min-w-0 max-w-full truncate font-medium">{runningTask.title}</span>
            <span className="font-semibold tnum">{clock(workedSeconds(runningTask))}</span>
            <span className="text-muted sm:ml-auto">Do not close this tab. Closing it discards the task.</span>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/** Full-screen reminder that cannot be dismissed except by acknowledging it. */
function ReminderGate() {
  const { items, markRead } = useNotifications();
  const pending = useMemo(() => items.filter((n) => n.type === "reminder" && !n.read_at), [items]);
  const open = pending.length > 0;
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const a = new Audio("/sounds/reminder-siren.mp3");
    a.loop = true;
    audio.current = a;
    let unlocked = false;
    const tryPlay = () => {
      a.play()
        .then(() => {
          unlocked = true;
          window.removeEventListener("pointerdown", tryPlay);
          window.removeEventListener("keydown", tryPlay);
        })
        .catch(() => {});
    };
    tryPlay();
    // Browsers block sound until the page has been clicked at least once
    // after loading; start the siren on the first interaction in that case.
    if (!unlocked) {
      window.addEventListener("pointerdown", tryPlay);
      window.addEventListener("keydown", tryPlay);
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      a.pause();
      audio.current = null;
      window.removeEventListener("pointerdown", tryPlay);
      window.removeEventListener("keydown", tryPlay);
      document.body.style.overflow = prev;
    };
  }, [open]);

  function acknowledge() {
    audio.current?.pause();
    pending.forEach((n) => markRead(n.id));
  }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-backdrop p-4 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="alertdialog"
          aria-modal="true"
          aria-label="Reminder from admin"
        >
          <motion.div
            className="card w-full max-w-[440px] overflow-hidden p-6 text-center sm:p-8"
            style={{ borderColor: "var(--danger-line)" }}
            initial={{ opacity: 0, y: 24, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 320, damping: 22 }}
          >
            <motion.span
              className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-danger-tint text-danger"
              animate={{ rotate: [0, -12, 12, -8, 8, 0] }}
              transition={{ duration: 0.9, repeat: Infinity, repeatDelay: 0.6 }}
            >
              <Siren size={30} />
            </motion.span>
            <h2 className="mt-5 text-2xl font-bold">Reminder from your admin</h2>
            <div className="mt-3 flex flex-col gap-2">
              {pending.slice(0, 3).map((n) => (
                <p key={n.id} className="break-words text-sm text-ink">
                  {n.body}
                </p>
              ))}
            </div>
            <p className="mt-3 text-[13px] text-muted">You need to acknowledge this to keep using the app.</p>
            <Button variant="primary" className="mt-6 w-full" onClick={acknowledge} autoFocus>
              Sorry, starting now
            </Button>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
