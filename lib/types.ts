export type Role = "admin" | "member";
export type TaskStatus = "pending" | "submitted" | "approved" | "overdue" | "discarded";
export type DisplayStatus = TaskStatus | "rejected";

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  title: string;
  role: Role;
  is_active: boolean;
  avatar_url: string | null;
  pending_approval: boolean;
  created_at: string;
}

export interface Task {
  id: string;
  user_id: string;
  title: string;
  description: string;
  estimated_hours: number;
  planned_start_at: string;
  due_at: string;
  original_due_at: string;
  task_date: string;
  status: TaskStatus;
  went_overdue_at: string | null;
  submitted_at: string | null;
  submission_note: string | null;
  completed_late: boolean;
  approved_at: string | null;
  rejection_reason: string | null;
  rejected_at: string | null;
  rejection_count: number;
  started_at: string | null;
  first_started_at: string | null;
  worked_seconds: number;
  credited_hours: number | null;
  discarded_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskProof {
  id: string;
  task_id: string;
  user_id: string;
  kind: "file" | "link";
  storage_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  url: string | null;
  created_at: string;
}

export interface Notification {
  id: string;
  recipient_id: string;
  type: "task_overdue" | "task_submitted" | "task_approved" | "task_rejected" | "no_plan" | "reminder" | "signup_request" | "task_discarded";
  task_id: string | null;
  subject_user_id: string | null;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
}

export interface Settings {
  id: number;
  company_name: string;
  timezone: string;
  no_plan_cutoff: string;
  work_days: number[];
  offline_grace_minutes: number;
}

export interface LeaderRow {
  user_id: string;
  full_name: string;
  title: string;
  avatar_url: string | null;
  hours: number;
  tasks_completed: number;
  on_time_count: number;
}

/** A task that was sent back and not yet resubmitted shows as "Rejected". */
export function displayStatus(t: Pick<Task, "status" | "rejection_reason">): DisplayStatus {
  if (t.rejection_reason && (t.status === "pending" || t.status === "overdue")) {
    return t.status === "overdue" ? "overdue" : "rejected";
  }
  return t.status;
}

export function normalizeTask(t: Task): Task {
  return {
    ...t,
    estimated_hours: Number(t.estimated_hours),
    credited_hours: t.credited_hours == null ? null : Number(t.credited_hours),
    worked_seconds: Number(t.worked_seconds ?? 0),
  };
}

/** Job roles are stored as one comma-separated string, e.g. "Video Editor, AI Engineer". */
export const ROLE_PRESETS = ["Video Editor", "YouTube Video Maker", "GoHighLevel Expert", "AI Engineer"];
export function splitRoles(title: string | null | undefined): string[] {
  return (title ?? "")
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean);
}
export function joinRoles(roles: string[]): string {
  return Array.from(new Set(roles.map((r) => r.trim()).filter(Boolean))).join(", ");
}

/** Seconds worked so far, including the current run if the timer is on. */
export function workedSeconds(t: Pick<Task, "worked_seconds" | "started_at">, now = Date.now()): number {
  const running = t.started_at ? Math.max(0, Math.floor((now - new Date(t.started_at).getTime()) / 1000)) : 0;
  return (t.worked_seconds ?? 0) + running;
}
/** Hours that count for this task: actual credited hours once submitted, else the estimate. */
export function countedHours(t: Pick<Task, "credited_hours" | "estimated_hours">): number {
  return t.credited_hours ?? t.estimated_hours;
}
export const ONLINE_WINDOW_MS = 90_000;
export function isOnline(lastSeen: string | null | undefined, now = Date.now()): boolean {
  return !!lastSeen && now - new Date(lastSeen).getTime() < ONLINE_WINDOW_MS;
}
