"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { addDays, pkDate, pkHM, pkToISO } from "@/lib/time";
import type { Profile, Task } from "@/lib/types";
import { Button, Field, Modal, inputClass, useToast } from "./ui";

type Errors = Partial<Record<"title" | "hours" | "start" | "due" | "form" | "owner", string>>;

/**
 * Create (member or admin) or edit (admin only) a task.
 * Members cannot change hours or due time afterwards; the database enforces it.
 */
export function TaskFormModal({
  open,
  onClose,
  onSaved,
  userId,
  task,
  members,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  userId: string;
  task?: Task | null;
  members?: Profile[];
}) {
  const toast = useToast();
  const editing = !!task;
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [hours, setHours] = useState("");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [owner, setOwner] = useState(userId);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    if (task) {
      setTitle(task.title);
      setDescription(task.description);
      setHours(String(task.estimated_hours));
      setStartDate(pkDate(task.planned_start_at));
      setStartTime(pkHM(task.planned_start_at));
      setDueDate(pkDate(task.due_at));
      setDueTime(pkHM(task.due_at));
      setOwner(task.user_id);
    } else {
      const today = pkDate();
      const nowHM = pkHM();
      setTitle("");
      setDescription("");
      setHours("");
      setStartDate(today);
      setStartTime(nowHM);
      // Sensible default: end of the working day, or end of the day if it is already late.
      setDueDate(nowHM >= "23:30" ? addDays(today, 1) : today);
      setDueTime(nowHM < "17:00" || nowHM >= "23:30" ? "18:00" : "23:59");
      setOwner(userId);
    }
  }, [open, task, userId]);

  async function save() {
    const e: Errors = {};
    const h = Number(hours);
    if (!title.trim()) e.title = "Give the task a title.";
    if (!hours || Number.isNaN(h) || h <= 0) e.hours = "Enter the estimated hours, for example 1.5.";
    else if (h > 24) e.hours = "Estimated hours cannot be more than 24.";
    if (!startDate || !startTime) e.start = "Choose a planned start date and time.";
    if (!dueDate || !dueTime) e.due = "Choose a due date and time.";
    let startISO = "";
    let dueISO = "";
    if (!e.start && !e.due) {
      startISO = pkToISO(startDate, startTime);
      dueISO = pkToISO(dueDate, dueTime);
      if (dueISO <= startISO) e.due = "The due time must be after the planned start.";
      else if (!editing && new Date(dueISO).getTime() <= Date.now()) e.due = "The due time must be in the future.";
      if (!editing && startDate < pkDate()) e.start = "Tasks cannot be added for past days.";
    }
    setErrors(e);
    if (Object.keys(e).length) return;

    setBusy(true);
    const sb = supabaseBrowser();
    const payload = {
      title: title.trim(),
      description: description.trim(),
      estimated_hours: h,
      planned_start_at: startISO,
      due_at: dueISO,
    };
    const { error } = editing
      ? await sb.from("tasks").update(payload).eq("id", task!.id)
      : await sb.from("tasks").insert({ ...payload, user_id: owner, original_due_at: dueISO, task_date: startDate });
    setBusy(false);
    if (error) {
      setErrors({ form: error.message });
      return;
    }
    toast({ title: editing ? "Task updated" : "Task added", tone: "success" });
    onSaved();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "Edit task" : "Add task"}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} loading={busy}>
            {editing ? "Save changes" : "Add task"}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        noValidate
      >
        {errors.form ? (
          <p role="alert" className="rounded-xl border border-danger-line bg-danger-tint px-3 py-2.5 text-[13px] text-danger">
            {errors.form}
          </p>
        ) : null}
        {!editing && members && members.length > 0 ? (
          <Field label="Assign to">
            {(p) => (
              <select {...p} className={inputClass} value={owner} onChange={(e) => setOwner(e.target.value)}>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name} ({m.title || m.role})
                  </option>
                ))}
              </select>
            )}
          </Field>
        ) : null}
        <Field label="Title" error={errors.title}>
          {(p) => <input {...p} className={inputClass} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="What will you deliver?" />}
        </Field>
        <Field label="Description" hint="Optional. Add any detail that helps review the work.">
          {(p) => <textarea {...p} rows={3} className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} />}
        </Field>
        <Field label="Estimated hours" error={errors.hours} className="max-w-[200px]">
          {(p) => (
            <input {...p} type="number" inputMode="decimal" min="0.25" max="24" step="0.25" className={inputClass + " tnum"} value={hours} onChange={(e) => setHours(e.target.value)} placeholder="1.5" />
          )}
        </Field>
        <div className="flex flex-col gap-4">
          <Field label="Planned start" error={errors.start}>
            {(p) => (
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,140px)] gap-2">
                <input {...p} type="date" className={inputClass + " min-w-0 tnum"} value={startDate} min={editing ? undefined : pkDate()} onChange={(e) => setStartDate(e.target.value)} />
                <input aria-label="Planned start time" type="time" className={inputClass + " min-w-0 tnum"} value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </div>
            )}
          </Field>
          <Field label="Due" error={errors.due}>
            {(p) => (
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,140px)] gap-2">
                <input {...p} type="date" className={inputClass + " min-w-0 tnum"} value={dueDate} min={editing ? undefined : pkDate()} onChange={(e) => setDueDate(e.target.value)} />
                <input aria-label="Due time" type="time" className={inputClass + " min-w-0 tnum"} value={dueTime} onChange={(e) => setDueTime(e.target.value)} />
              </div>
            )}
          </Field>
        </div>
        {!editing ? (
          <p className="rounded-xl bg-accent-tint px-3.5 py-2.5 text-[13px] text-ink">
            Once added, the due time and estimated hours are locked and the task cannot be deleted. Only the admin can change them.
          </p>
        ) : null}
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}
