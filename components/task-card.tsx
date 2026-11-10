"use client";

import { Clock, Hourglass, MessageSquareWarning } from "lucide-react";
import { fmtDateTime, fmtDuration, fmtHours, fmtTime, pkDate } from "@/lib/time";
import { displayStatus, type Task } from "@/lib/types";
import { Avatar, StatusBadge, cx, statusBar } from "./ui";

export function timeWindow(t: Task) {
  const sameDay = pkDate(t.planned_start_at) === pkDate(t.due_at);
  return sameDay
    ? `${fmtDateTime(t.planned_start_at)} to ${fmtTime(t.due_at)}`
    : `${fmtDateTime(t.planned_start_at)} to ${fmtDateTime(t.due_at)}`;
}

export function overdueText(t: Task): string | null {
  if (t.status !== "overdue") return null;
  return `Overdue by ${fmtDuration(Date.now() - new Date(t.due_at).getTime())}`;
}

export function TaskCard({
  task,
  owner,
  onOpen,
  actionLabel,
}: {
  task: Task;
  owner?: { full_name: string; title?: string };
  onOpen: () => void;
  actionLabel?: string;
}) {
  const ds = displayStatus(task);
  const overdue = overdueText(task);
  return (
    <button
      onClick={onOpen}
      className="card lift group relative flex w-full items-stretch overflow-hidden text-left"
    >
      <span aria-hidden className="absolute bottom-3.5 left-2 top-3.5 w-1 rounded-full" style={{ background: statusBar(ds) }} />
      <div className="flex min-w-0 flex-1 flex-col gap-2 py-4 pl-6 pr-4 sm:flex-row sm:items-center sm:gap-4 sm:pr-5">
        <div className="min-w-0 flex-1">
          {owner ? (
            <div className="mb-1.5 flex items-center gap-2">
              <Avatar name={owner.full_name} size={20} />
              <span className="truncate text-[13px] font-medium">{owner.full_name}</span>
            </div>
          ) : null}
          <p className="break-words text-[15px] font-medium leading-snug">{task.title}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted tnum">
            <span className="inline-flex items-center gap-1.5">
              <Clock size={14} /> {timeWindow(task)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Hourglass size={14} /> {fmtHours(task.estimated_hours)}h est.
            </span>
          </div>
          {overdue ? (
            <p className="mt-2 inline-flex items-center gap-2 text-[13px] font-semibold text-danger tnum">
              <span className="pulse-dot" aria-hidden /> {overdue}
            </p>
          ) : null}
          {task.rejection_reason && task.status !== "submitted" && task.status !== "approved" ? (
            <p className="mt-2 flex items-start gap-1.5 text-[13px] text-danger">
              <MessageSquareWarning size={14} className="mt-0.5 flex-none" />
              <span className="break-words">Rejected: {task.rejection_reason}</span>
            </p>
          ) : null}
        </div>
        <div className="flex flex-none items-center justify-between gap-3 sm:flex-col sm:items-end sm:justify-center">
          <StatusBadge status={ds} late={task.completed_late} />
          {actionLabel ? (
            <span className={cx("text-[13px] font-medium text-accent-ink underline-offset-4 group-hover:underline")}>{actionLabel}</span>
          ) : null}
        </div>
      </div>
    </button>
  );
}
