export type Role = "admin" | "member";
export type TaskStatus = "pending" | "submitted" | "approved" | "overdue";
export type DisplayStatus = TaskStatus | "rejected";

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  title: string;
  role: Role;
  is_active: boolean;
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
  type: "task_overdue" | "task_submitted" | "task_approved" | "task_rejected" | "no_plan";
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
}

export interface LeaderRow {
  user_id: string;
  full_name: string;
  title: string;
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
  return { ...t, estimated_hours: Number(t.estimated_hours) };
}
