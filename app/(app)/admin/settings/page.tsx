"use client";

import { useEffect, useState } from "react";
import { Button, ErrorState, Field, PageHeader, Skeleton, cx, inputClass, useToast } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Settings } from "@/lib/types";

const days = [
  { n: 1, l: "Mon" },
  { n: 2, l: "Tue" },
  { n: 3, l: "Wed" },
  { n: 4, l: "Thu" },
  { n: 5, l: "Fri" },
  { n: 6, l: "Sat" },
  { n: 7, l: "Sun" },
];

export default function SettingsPage() {
  const toast = useToast();
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [company, setCompany] = useState("");
  const [cutoff, setCutoff] = useState("11:00");
  const [workDays, setWorkDays] = useState<number[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data, error: err } = await supabaseBrowser().from("settings").select("*").eq("id", 1).single();
    if (err) return setError(err.message);
    const s = data as Settings;
    setError(null);
    setCompany(s.company_name);
    setCutoff(s.no_plan_cutoff.slice(0, 5));
    setWorkDays(s.work_days);
    setLoaded(true);
  }
  useEffect(() => {
    load();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!company.trim()) errs.company = "Enter your company name.";
    if (!/^\d{2}:\d{2}$/.test(cutoff)) errs.cutoff = "Choose a cutoff time.";
    if (workDays.length === 0) errs.days = "Choose at least one working day.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    const { error: err } = await supabaseBrowser()
      .from("settings")
      .update({ company_name: company.trim(), no_plan_cutoff: cutoff, work_days: [...workDays].sort() })
      .eq("id", 1);
    setBusy(false);
    if (err) return toast({ title: "Could not save", body: err.message, tone: "error" });
    toast({ title: "Settings saved", tone: "success" });
  }

  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div>
      <PageHeader title="Settings" subtitle="Rules that apply to the whole team." />
      {!loaded ? (
        <Skeleton className="h-[420px] max-w-[640px]" />
      ) : (
        <form onSubmit={save} noValidate className="max-w-[640px] border border-line bg-surface">
          <section className="flex flex-col gap-4 border-b border-line p-5">
            <h2 className="text-lg font-semibold">Company</h2>
            <Field label="Company name" error={errors.company}>
              {(p) => <input {...p} className={inputClass} value={company} onChange={(e) => setCompany(e.target.value)} />}
            </Field>
            <Field label="Timezone" hint="All dates, due times and the meaning of 'today' use this timezone.">
              {(p) => <input {...p} className={inputClass} value="Asia/Karachi (PKT, UTC+5)" disabled readOnly />}
            </Field>
          </section>
          <section className="flex flex-col gap-4 p-5">
            <h2 className="text-lg font-semibold">Daily plan cutoff</h2>
            <Field
              label="Flag members with no tasks by"
              error={errors.cutoff}
              hint="Members who have not added any task for today by this time appear under 'No plan today' and trigger an alert."
              className="max-w-[220px]"
            >
              {(p) => <input {...p} type="time" className={inputClass + " tnum"} value={cutoff} onChange={(e) => setCutoff(e.target.value)} />}
            </Field>
            <fieldset>
              <legend className="text-[13px] font-medium">Working days</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {days.map((d) => {
                  const on = workDays.includes(d.n);
                  return (
                    <button
                      key={d.n}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setWorkDays((w) => (on ? w.filter((x) => x !== d.n) : [...w, d.n]))}
                      className={cx(
                        "h-11 w-14 border text-[13px] font-medium transition-colors",
                        on ? "border-accent bg-accent text-on-accent" : "border-line-strong bg-surface text-muted hover:border-accent",
                      )}
                    >
                      {d.l}
                    </button>
                  );
                })}
              </div>
              {errors.days ? (
                <p className="mt-1.5 text-[13px] text-danger" role="alert">
                  {errors.days}
                </p>
              ) : (
                <p className="mt-1.5 text-xs text-muted">The no-plan alert is only sent on these days.</p>
              )}
            </fieldset>
          </section>
          <div className="flex justify-end border-t border-line p-4">
            <Button type="submit" variant="primary" loading={busy}>
              Save settings
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
