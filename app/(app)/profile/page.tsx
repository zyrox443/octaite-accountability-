"use client";

import { Camera, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/providers";
import { Avatar, Button, Field, PageHeader, PasswordInput, inputClass, useToast } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import { splitRoles } from "@/lib/types";

export default function ProfilePage() {
  const { profile, refreshProfile } = useAuth();
  const toast = useToast();
  const me = profile!;
  const [fullName, setFullName] = useState(me.full_name);
  const [file, setFile] = useState<File | null>(null);
  const [remove, setRemove] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [pwErrors, setPwErrors] = useState<Record<string, string>>({});
  const [pwBusy, setPwBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function pick(f: File | undefined) {
    if (!f) return;
    if (!f.type.startsWith("image/")) return setErrors({ avatar: "Choose an image file." });
    if (f.size > 2 * 1024 * 1024) return setErrors({ avatar: "The picture must be smaller than 2 MB." });
    setErrors({});
    setRemove(false);
    setFile(f);
  }

  const shown = remove ? null : (preview ?? me.avatar_url);
  const dirty = fullName.trim() !== me.full_name || !!file || (remove && !!me.avatar_url);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) return setErrors({ full_name: "Enter your full name." });
    setBusy(true);
    const body = new FormData();
    body.set("full_name", fullName.trim());
    if (file) body.set("avatar", file);
    else if (remove) body.set("remove_avatar", "1");
    const res = await fetch("/api/profile", { method: "PATCH", body });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setErrors({ [json.field ?? "form"]: json.error ?? "Something went wrong. Try again." });
    setErrors({});
    setFile(null);
    setRemove(false);
    await refreshProfile();
    toast({ title: "Profile updated", tone: "success" });
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (pw.length < 8) errs.pw = "Password must be at least 8 characters.";
    else if (pw !== pw2) errs.pw2 = "The two passwords do not match.";
    setPwErrors(errs);
    if (Object.keys(errs).length) return;
    setPwBusy(true);
    const { error } = await supabaseBrowser().auth.updateUser({ password: pw });
    setPwBusy(false);
    if (error) return setPwErrors({ pw: error.message });
    setPw("");
    setPw2("");
    toast({ title: "Password changed", body: "Use the new password next time you sign in.", tone: "success" });
  }

  const roles = splitRoles(me.title);

  return (
    <div>
      <PageHeader title="My profile" subtitle="Update your picture, name and password." />
      <div className="grid max-w-[920px] gap-5 lg:grid-cols-2">
        <form onSubmit={save} noValidate className="card flex flex-col gap-5 p-5 sm:p-6">
          <h2 className="text-lg font-semibold">Profile</h2>
          {errors.form ? (
            <p role="alert" className="rounded-xl border border-danger-line bg-danger-tint px-3 py-2.5 text-[13px] text-danger">
              {errors.form}
            </p>
          ) : null}
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              aria-label="Change profile picture"
              className="group relative flex-none rounded-full transition-transform active:scale-95"
            >
              <Avatar name={fullName || me.full_name} size={88} src={shown} />
              <span className="btn-primary absolute -bottom-0.5 -right-0.5 flex h-8 w-8 items-center justify-center rounded-full ring-2 ring-surface">
                <Camera size={15} />
              </span>
            </button>
            <div className="min-w-0">
              <p className="text-[13px] font-medium">Profile picture</p>
              <p className="text-xs text-muted">PNG or JPG, up to 2 MB.</p>
              <div className="mt-1 flex flex-wrap gap-x-4">
                <button type="button" onClick={() => fileRef.current?.click()} className="min-h-9 text-[13px] font-semibold text-accent-ink underline-offset-4 hover:underline">
                  {shown ? "Change picture" : "Upload picture"}
                </button>
                {shown ? (
                  <button
                    type="button"
                    onClick={() => {
                      setFile(null);
                      setRemove(true);
                    }}
                    className="inline-flex min-h-9 items-center gap-1 text-[13px] font-medium text-muted hover:text-danger"
                  >
                    <Trash2 size={13} /> Remove
                  </button>
                ) : null}
              </div>
              {errors.avatar ? (
                <p className="text-[13px] text-danger" role="alert">
                  {errors.avatar}
                </p>
              ) : null}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                pick(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>
          <Field label="Full name" error={errors.full_name}>
            {(p) => <input {...p} className={inputClass} value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" />}
          </Field>
          <Field label="Email" hint="Your sign-in email cannot be changed here.">
            {(p) => <input {...p} className={inputClass} value={me.email} disabled readOnly />}
          </Field>
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium">{me.role === "admin" ? "Title" : "Roles"}</span>
            <div className="flex flex-wrap gap-2">
              {(roles.length ? roles : [me.role === "admin" ? "Admin" : "No role set"]).map((r) => (
                <span key={r} className="inline-flex min-h-8 items-center rounded-full bg-accent-tint px-3 text-[13px] font-medium text-accent-ink">
                  {r}
                </span>
              ))}
            </div>
            {me.role === "member" ? <span className="text-xs text-muted">Roles are set by your admin.</span> : null}
          </div>
          <Button type="submit" variant="primary" loading={busy} disabled={!dirty} className="self-start">
            Save profile
          </Button>
        </form>

        <form onSubmit={changePassword} noValidate className="card flex flex-col gap-4 self-start p-5 sm:p-6">
          <h2 className="text-lg font-semibold">Password</h2>
          <Field label="New password" error={pwErrors.pw} hint="At least 8 characters.">
            {(p) => <PasswordInput {...p} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />}
          </Field>
          <Field label="Repeat new password" error={pwErrors.pw2}>
            {(p) => <PasswordInput {...p} value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />}
          </Field>
          <Button type="submit" loading={pwBusy} disabled={!pw} className="self-start">
            Change password
          </Button>
        </form>
      </div>
    </div>
  );
}
