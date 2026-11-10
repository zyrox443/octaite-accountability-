"use client";

import { motion } from "framer-motion";
import { KeyRound, Pencil, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/providers";
import { Avatar, Button, EmptyState, ErrorState, Field, Modal, PageHeader, Skeleton, cx, inputClass, stagger, staggerItem, useToast } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";

function randomPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

export default function TeamPage() {
  const { profile } = useAuth();
  const [people, setPeople] = useState<Profile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);

  const load = useCallback(async () => {
    const { data, error: err } = await supabaseBrowser().from("profiles").select("*").order("role").order("full_name");
    if (err) return setError(err.message);
    setError(null);
    setPeople(data as Profile[]);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const members = people?.filter((p) => p.role === "member") ?? [];

  return (
    <div>
      <PageHeader
        title="Team"
        subtitle="Only you can create accounts. There is no public sign-up."
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            <UserPlus size={16} /> Add member
          </Button>
        }
      />
      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : people === null ? (
        <div className="flex flex-col gap-2.5">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[68px]" />
          ))}
        </div>
      ) : members.length === 0 ? (
        <EmptyState
          icon={<Users size={20} />}
          title="No team members yet"
          body="Create an account for each person. Share the email and password with them so they can sign in."
          action={
            <Button variant="primary" onClick={() => setCreating(true)}>
              <UserPlus size={16} /> Add member
            </Button>
          }
        />
      ) : (
        <div className="border-line md:border md:bg-surface">
          <div className="hidden grid-cols-[1.4fr_1fr_1.4fr_110px_170px] gap-4 border-b border-line px-5 py-2.5 text-xs font-medium text-muted md:grid">
            <span>Member</span>
            <span>Role</span>
            <span>Email</span>
            <span>Status</span>
            <span className="text-right">Actions</span>
          </div>
          <motion.ul variants={stagger} initial="hidden" animate="show" className="flex flex-col gap-2.5 md:gap-0">
            {people.map((p) => (
              <motion.li
                key={p.id}
                variants={staggerItem}
                className="border border-line bg-surface p-4 md:grid md:grid-cols-[1.4fr_1fr_1.4fr_110px_170px] md:items-center md:gap-4 md:border-0 md:border-b md:px-5 md:py-3 md:last:border-b-0"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={p.full_name} accent={p.role === "admin"} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{p.full_name}</p>
                    <p className="truncate text-xs text-muted md:hidden">{p.title || (p.role === "admin" ? "Admin" : "")}</p>
                  </div>
                </div>
                <p className="hidden truncate text-sm md:block">{p.title || "-"}</p>
                <p className="mt-2 truncate text-[13px] text-muted md:mt-0 md:text-sm">{p.email}</p>
                <div className="mt-3 md:mt-0">
                  <span
                    className="inline-flex h-[22px] items-center px-2 text-[11px] font-semibold uppercase tracking-[0.06em]"
                    style={
                      p.role === "admin"
                        ? { color: "var(--accent-ink)", background: "var(--accent-tint)" }
                        : p.is_active
                          ? { color: "var(--st-approved-fg)", background: "var(--st-approved-bg)" }
                          : { color: "var(--st-pending-fg)", background: "var(--st-pending-bg)" }
                    }
                  >
                    {p.role === "admin" ? "Admin" : p.is_active ? "Active" : "Inactive"}
                  </span>
                </div>
                <div className={cx("mt-3 flex gap-2 md:mt-0 md:justify-end")}>
                  {p.role === "member" ? (
                    <Link
                      href={`/admin/team/${p.id}`}
                      className="inline-flex min-h-11 flex-1 items-center justify-center border border-line-strong px-3 text-[13px] font-medium transition-colors hover:border-accent md:min-h-9 md:flex-none"
                    >
                      View work
                    </Link>
                  ) : null}
                  <Button size="sm" className="min-h-11 flex-1 md:min-h-9 md:flex-none" onClick={() => setEditing(p)}>
                    <Pencil size={14} /> Edit
                  </Button>
                </div>
              </motion.li>
            ))}
          </motion.ul>
        </div>
      )}

      <MemberModal open={creating} onClose={() => setCreating(false)} onSaved={load} />
      <MemberModal open={!!editing} member={editing} isSelf={editing?.id === profile?.id} onClose={() => setEditing(null)} onSaved={load} />
    </div>
  );
}

function MemberModal({
  open,
  member,
  isSelf,
  onClose,
  onSaved,
}: {
  open: boolean;
  member?: Profile | null;
  isSelf?: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const editing = !!member;
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [title, setTitle] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<"" | "save" | "toggle">("");

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setFullName(member?.full_name ?? "");
    setEmail(member?.email ?? "");
    setTitle(member?.title ?? "");
    setPassword("");
  }, [open, member]);

  async function call(body: Record<string, unknown>, kind: "save" | "toggle") {
    setBusy(kind);
    const res = await fetch(editing ? `/api/admin/members/${member!.id}` : "/api/admin/members", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    setBusy("");
    if (!res.ok) {
      setErrors({ [json.field ?? "form"]: json.error ?? "Something went wrong. Try again." });
      return false;
    }
    onSaved();
    return true;
  }

  async function save() {
    const e: Record<string, string> = {};
    if (!fullName.trim()) e.full_name = "Name is required.";
    if (!editing && !/^\S+@\S+\.\S+$/.test(email.trim())) e.email = "Enter a valid email address.";
    if (!editing && password.length < 8) e.password = "Password must be at least 8 characters.";
    if (editing && password && password.length < 8) e.password = "Password must be at least 8 characters.";
    setErrors(e);
    if (Object.keys(e).length) return;
    const ok = await call(
      editing ? { full_name: fullName, title, ...(password ? { password } : {}) } : { full_name: fullName, email, title, password },
      "save",
    );
    if (ok) {
      toast({ title: editing ? "Member updated" : "Member created", body: editing ? undefined : `${fullName} can now sign in with ${email}.`, tone: "success" });
      onClose();
    }
  }

  async function toggleActive() {
    const ok = await call({ is_active: !member!.is_active }, "toggle");
    if (ok) {
      toast({ title: member!.is_active ? "Member deactivated" : "Member reactivated", tone: "info" });
      onClose();
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "Edit member" : "Add member"}
      footer={
        <>
          {editing && !isSelf && member!.role === "member" ? (
            <Button variant={member!.is_active ? "danger" : "secondary"} className="mr-auto" onClick={toggleActive} loading={busy === "toggle"}>
              {member!.is_active ? "Deactivate" : "Reactivate"}
            </Button>
          ) : null}
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} loading={busy === "save"}>
            {editing ? "Save changes" : "Create account"}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        {errors.form ? (
          <p role="alert" className="border border-danger-line bg-danger-tint px-3 py-2.5 text-[13px] text-danger">
            {errors.form}
          </p>
        ) : null}
        <Field label="Full name" error={errors.full_name}>
          {(p) => <input {...p} className={inputClass} value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="off" />}
        </Field>
        <Field label="Email" error={errors.email} hint={editing ? "The sign-in email cannot be changed here." : undefined}>
          {(p) => <input {...p} type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} disabled={editing} autoComplete="off" />}
        </Field>
        <Field label="Role / title" hint="For example Video Editor, GHL Expert or AI Engineer.">
          {(p) => <input {...p} className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} autoComplete="off" />}
        </Field>
        <Field
          label={editing ? "New password" : "Password"}
          error={errors.password}
          hint={editing ? "Leave empty to keep the current password." : "At least 8 characters. Share it with the member privately."}
        >
          {(p) => (
            <div className="flex gap-2">
              <input {...p} type="text" className={inputClass + " tnum"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" />
              <Button type="button" onClick={() => setPassword(randomPassword())}>
                <KeyRound size={15} /> Generate
              </Button>
            </div>
          )}
        </Field>
        {editing && member && !member.is_active ? (
          <p className="border-l-2 border-line-strong bg-surface-2 px-3 py-2 text-[13px] text-muted">This account is inactive and cannot sign in.</p>
        ) : null}
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}
