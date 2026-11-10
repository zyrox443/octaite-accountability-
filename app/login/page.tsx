"use client";

import { motion } from "framer-motion";
import { ClipboardCheck, ShieldCheck, Trophy } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Field, inputClass } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("reason") === "inactive") {
      setErrors({ form: "This account is not active. Ask your admin to enable it." });
    }
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) next.email = "Enter a valid email address.";
    if (!password) next.password = "Enter your password.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    const sb = supabaseBrowser();
    const { data, error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
    if (error || !data.user) {
      setBusy(false);
      setErrors({
        form: error?.message.toLowerCase().includes("banned")
          ? "This account has been deactivated. Ask your admin to enable it."
          : "Email or password is incorrect.",
      });
      return;
    }
    const { data: profile } = await sb.from("profiles").select("role,is_active").eq("id", data.user.id).maybeSingle();
    if (!profile?.is_active) {
      await sb.auth.signOut();
      setBusy(false);
      setErrors({ form: "This account is not active. Ask your admin to enable it." });
      return;
    }
    router.replace(profile.role === "admin" ? "/admin" : "/my-day");
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <aside className="hidden flex-col justify-between border-r border-line bg-surface p-12 lg:flex">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center bg-accent text-sm font-bold text-on-accent">O</span>
          <span className="text-base font-semibold tracking-tight">Octaite Accountability</span>
        </div>
        <div>
          <h2 className="max-w-md text-[34px] font-semibold leading-[1.15] tracking-tight">
            Plan the day. Prove the work. See who delivered.
          </h2>
          <ul className="mt-10 flex flex-col gap-5">
            {[
              { icon: <ClipboardCheck size={18} />, t: "Daily plans", d: "Every task has an owner, an estimate and a due time." },
              { icon: <ShieldCheck size={18} />, t: "Proof before approval", d: "Files or links are required to complete a task." },
              { icon: <Trophy size={18} />, t: "Leaderboard", d: "Approved hours ranked by week, month and all time." },
            ].map((f) => (
              <li key={f.t} className="flex items-start gap-4">
                <span className="flex h-9 w-9 flex-none items-center justify-center border border-line bg-accent-tint text-accent-ink">{f.icon}</span>
                <span>
                  <span className="block text-sm font-semibold">{f.t}</span>
                  <span className="block text-sm text-muted">{f.d}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-muted">All times shown in Pakistan Standard Time.</p>
      </aside>

      <main className="flex items-center justify-center px-4 py-12">
        <motion.div
          className="w-full max-w-[400px]"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
        >
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="flex h-8 w-8 items-center justify-center bg-accent text-sm font-bold text-on-accent">O</span>
            <span className="text-base font-semibold tracking-tight">Octaite Accountability</span>
          </div>
          <h1 className="text-[28px] font-semibold leading-tight">Sign in</h1>
          <p className="mt-1 text-sm text-muted">Use the email and password your admin gave you.</p>

          <form onSubmit={onSubmit} noValidate className="mt-8 flex flex-col gap-4">
            {errors.form ? (
              <p role="alert" className="border border-danger-line bg-danger-tint px-3 py-2.5 text-[13px] text-danger">
                {errors.form}
              </p>
            ) : null}
            <Field label="Email" error={errors.email}>
              {(p) => (
                <input {...p} type="email" autoComplete="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
              )}
            </Field>
            <Field label="Password" error={errors.password}>
              {(p) => (
                <input {...p} type="password" autoComplete="current-password" className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} />
              )}
            </Field>
            <Button type="submit" variant="primary" loading={busy} className="mt-2 w-full">
              Sign in
            </Button>
          </form>
          <p className="mt-6 text-xs text-muted">No account? Accounts are created by your admin.</p>
        </motion.div>
      </main>
    </div>
  );
}
