"use client";

import { motion } from "framer-motion";
import { Camera, CircleCheckBig } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button, Field, RolesInput, inputClass } from "@/components/ui";
import { initials } from "@/lib/time";
import { ROLE_PRESETS, joinRoles } from "@/lib/types";

export default function SignupPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [roles, setRoles] = useState<string[]>([]);
  const [avatar, setAvatar] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const clear = (key: string) => setErrors((e) => (e[key] || e.form ? { ...e, [key]: "", form: "" } : e));

  useEffect(() => {
    if (!avatar) return setPreview(null);
    const url = URL.createObjectURL(avatar);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [avatar]);

  function pickAvatar(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return setErrors((e) => ({ ...e, avatar: "Choose an image file." }));
    if (file.size > 2 * 1024 * 1024) return setErrors((e) => ({ ...e, avatar: "The picture must be smaller than 2 MB." }));
    setErrors((e) => ({ ...e, avatar: "" }));
    setAvatar(file);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!fullName.trim()) next.full_name = "Enter your full name.";
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) next.email = "Enter a valid email address.";
    if (password.length < 8) next.password = "Password must be at least 8 characters.";
    if (roles.length === 0) next.title = "Choose at least one role.";
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    const body = new FormData();
    body.set("full_name", fullName.trim());
    body.set("email", email.trim());
    body.set("password", password);
    body.set("title", joinRoles(roles));
    if (avatar) body.set("avatar", avatar);
    const res = await fetch("/api/signup", { method: "POST", body });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setErrors({ [json.field ?? "form"]: json.error ?? "Something went wrong. Try again." });
    setDone(true);
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <motion.div
        className="card w-full max-w-[480px] p-6 sm:p-8"
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 280, damping: 26 }}
      >
        <div className="mb-6 flex items-center gap-2.5">
          <span className="btn-primary flex h-9 w-9 items-center justify-center rounded-xl text-sm font-bold">O</span>
          <span className="text-base font-semibold tracking-tight">Octaite Accountability</span>
        </div>

        {done ? (
          <div className="py-4 text-center">
            <motion.span
              initial={{ scale: 0, rotate: -30 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 14 }}
              className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success-tint text-success"
            >
              <CircleCheckBig size={30} />
            </motion.span>
            <h1 className="mt-5 text-2xl font-bold">Account created</h1>
            <p className="mt-2 text-sm text-muted">
              Your admin has been notified. You can sign in as soon as they approve your account.
            </p>
            <Link href="/login" className="btn-primary mt-6 inline-flex min-h-11 items-center justify-center rounded-xl px-5 text-sm font-semibold">
              Back to sign in
            </Link>
          </div>
        ) : (
          <>
            <h1 className="text-[28px] font-bold leading-tight">Create your account</h1>
            <p className="mt-1 text-sm text-muted">Join your team. Your admin approves new accounts before first sign-in.</p>

            <form onSubmit={onSubmit} noValidate className="mt-6 flex flex-col gap-4">
              {errors.form ? (
                <p role="alert" className="rounded-xl border border-danger-line bg-danger-tint px-3 py-2.5 text-[13px] text-danger">
                  {errors.form}
                </p>
              ) : null}

              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  aria-label="Choose a profile picture"
                  className="group relative h-20 w-20 flex-none overflow-hidden rounded-full border border-dashed border-line-strong bg-surface-2 transition-colors hover:border-accent"
                >
                  {preview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={preview} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-xl font-semibold text-muted">
                      {fullName.trim() ? initials(fullName) : <Camera size={22} />}
                    </span>
                  )}
                </button>
                <div className="min-w-0">
                  <p className="text-[13px] font-medium">Profile picture</p>
                  <p className="text-xs text-muted">Optional. PNG or JPG, up to 2 MB.</p>
                  <button type="button" onClick={() => fileRef.current?.click()} className="mt-1 min-h-9 text-[13px] font-semibold text-accent-ink underline-offset-4 hover:underline">
                    {avatar ? "Change picture" : "Upload picture"}
                  </button>
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
                    pickAvatar(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </div>

              <Field label="Full name" error={errors.full_name}>
                {(p) => <input {...p} className={inputClass} value={fullName} onChange={(e) => {
                  setFullName(e.target.value);
                  clear("full_name");
                }} autoComplete="name" />}
              </Field>
              <Field label="Email" error={errors.email}>
                {(p) => <input {...p} type="email" className={inputClass} value={email} onChange={(e) => {
                  setEmail(e.target.value);
                  clear("email");
                }} autoComplete="email" placeholder="you@company.com" />}
              </Field>
              <Field label="Password" error={errors.password} hint="At least 8 characters.">
                {(p) => <input {...p} type="password" className={inputClass} value={password} onChange={(e) => {
                  setPassword(e.target.value);
                  clear("password");
                }} autoComplete="new-password" />}
              </Field>
              <div className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium">Your role</span>
                <span className="text-xs text-muted">Pick every role that applies to you.</span>
                <RolesInput
                  value={roles}
                  onChange={(r) => {
                    setRoles(r);
                    clear("title");
                  }}
                  presets={ROLE_PRESETS}
                />
                {errors.title ? (
                  <p className="text-[13px] text-danger" role="alert">
                    {errors.title}
                  </p>
                ) : null}
              </div>

              <Button type="submit" variant="primary" loading={busy} className="mt-2 w-full">
                Create account
              </Button>
            </form>
            <p className="mt-6 text-sm text-muted">
              Already have an account?{" "}
              <Link href="/login" className="font-semibold text-accent-ink underline-offset-4 hover:underline">
                Sign in
              </Link>
            </p>
          </>
        )}
      </motion.div>
    </div>
  );
}
