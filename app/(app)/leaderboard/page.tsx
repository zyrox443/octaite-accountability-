"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Crown, Trophy } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTableChanges } from "@/components/providers";
import { Avatar, CountUp, EmptyState, ErrorState, PageHeader, Skeleton, cx } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { LeaderRow } from "@/lib/types";

type Period = "week" | "month" | "all";
const tabs: { id: Period; label: string }[] = [
  { id: "week", label: "This Week" },
  { id: "month", label: "This Month" },
  { id: "all", label: "All Time" },
];

const MAX_STEP = 240;
const MIN_STEP = 64;

function onTimePct(r: LeaderRow) {
  return r.tasks_completed ? Math.round((r.on_time_count / r.tasks_completed) * 100) : 0;
}

export default function LeaderboardPage() {
  const [period, setPeriod] = useState<Period>("week");
  const [rows, setRows] = useState<LeaderRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [replay, setReplay] = useState(0);

  const load = useCallback(async (p: Period, silent = false) => {
    if (!silent) setRows(null);
    const { data, error: err } = await supabaseBrowser().rpc("get_leaderboard", { p_period: p });
    if (err) return setError(err.message);
    setError(null);
    setRows((data as LeaderRow[]).map((r) => ({ ...r, hours: Number(r.hours) })));
    if (!silent) setReplay((n) => n + 1);
  }, []);

  useEffect(() => {
    load(period);
  }, [period, load]);
  useTableChanges(["tasks"], () => load(period, true));

  const leader = rows?.[0]?.hours ?? 0;
  const podium = rows?.slice(0, 3) ?? [];
  const rest = rows?.slice(3) ?? [];

  return (
    <div>
      <PageHeader title="Leaderboard" subtitle="Ranked by hours of approved work. Week runs Monday to Sunday." />

      <div className="mb-10 inline-flex rounded-full border border-line bg-surface p-1 shadow-[var(--shadow-sm)]" role="tablist" aria-label="Period">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={period === t.id}
            onClick={() => setPeriod(t.id)}
            className={cx(
              "relative min-h-11 rounded-full px-4 text-sm font-semibold transition-colors sm:px-5",
              period === t.id ? "text-[#111111]" : "text-muted hover:text-ink",
            )}
          >
            {period === t.id ? (
              <motion.span layoutId="lb-tab" className="btn-primary absolute inset-0 rounded-full" transition={{ type: "spring", stiffness: 420, damping: 34 }} />
            ) : null}
            <span className="relative">{t.label}</span>
          </button>
        ))}
      </div>

      {error ? (
        <ErrorState message={error} onRetry={() => load(period)} />
      ) : rows === null ? (
        <PodiumSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState icon={<Trophy size={20} />} title="No team members yet" body="Once members are added and their tasks are approved, rankings appear here." />
      ) : (
        <>
          <Podium key={replay} rows={podium} leader={leader} />
          {leader === 0 ? (
            <p className="mt-6 text-center text-sm text-muted">No approved hours in this period yet. The first approved task takes the lead.</p>
          ) : null}
          {rest.length > 0 ? (
            <motion.ol
              key={`rest-${replay}`}
              className="card mt-10 overflow-hidden"
              initial="hidden"
              animate="show"
              variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.9 } } }}
            >
              {rest.map((r, i) => (
                <motion.li
                  key={r.user_id}
                  variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
                  className="flex items-center gap-3 border-b border-line p-4 last:border-b-0 sm:gap-4"
                >
                  <span className="w-6 flex-none text-center text-lg font-semibold text-accent-ink tnum">{i + 4}</span>
                  <Avatar name={r.full_name} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="truncate text-sm font-medium">{r.full_name}</p>
                      <p className="flex-none text-sm font-semibold tnum">
                        <CountUp value={r.hours} decimals={2} suffix="h" delay={0.9} />
                      </p>
                    </div>
                    <p className="truncate text-xs text-muted tnum">
                      {r.title} · {r.tasks_completed} {r.tasks_completed === 1 ? "task" : "tasks"} · {onTimePct(r)}% on time
                    </p>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
                      <motion.div
                        className="h-full rounded-full bg-accent"
                        initial={{ width: 0 }}
                        animate={{ width: `${leader ? (r.hours / leader) * 100 : 0}%` }}
                        transition={{ duration: 0.7, delay: 1, ease: [0.16, 1, 0.3, 1] }}
                      />
                    </div>
                  </div>
                </motion.li>
              ))}
            </motion.ol>
          ) : null}
        </>
      )}
    </div>
  );
}

/* Order on screen: 2nd (left), 1st (centre), 3rd (right). Rise order: 3rd, 2nd, 1st. */
function Podium({ rows, leader }: { rows: LeaderRow[]; leader: number }) {
  const reduce = useReducedMotion();
  const slots = [
    { row: rows[1], rank: 2, delay: 0.35 },
    { row: rows[0], rank: 1, delay: 0.7 },
    { row: rows[2], rank: 3, delay: 0 },
  ];
  return (
    <div className="mx-auto grid max-w-[760px] grid-cols-3 items-end gap-2 sm:gap-4">
      {slots.map(({ row, rank, delay }) => {
        if (!row) return <div key={rank} />;
        const height = leader > 0 ? Math.max(MIN_STEP, Math.round((row.hours / leader) * MAX_STEP)) : MIN_STEP;
        const first = rank === 1;
        return (
          <div key={rank} className="flex min-w-0 flex-col items-center">
            <motion.div
              className="flex w-full flex-col items-center px-1 pb-3 text-center"
              initial={{ opacity: 0, y: reduce ? 0 : 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: delay + 0.35 }}
            >
              {first ? (
                <motion.span
                  initial={{ opacity: 0, y: 10, rotate: -20, scale: 0.6 }}
                  animate={{ opacity: 1, y: 0, rotate: 0, scale: 1 }}
                  transition={{ type: "spring", stiffness: 300, damping: 14, delay: 1.5 }}
                  className="mb-1 text-accent"
                >
                  <Crown size={24} fill="currentColor" />
                </motion.span>
              ) : null}
              <Avatar name={row.full_name} size={first ? 56 : 44} accent={first} />
              <p
                className={cx(
                  "mt-2 w-full truncate text-[13px] font-semibold sm:text-[15px]",
                  first && "text-accent-ink",
                )}
              >
                {row.full_name}
              </p>
              <p className="w-full truncate text-[11px] text-muted sm:text-xs">{row.title}</p>
              <p className={cx("mt-1.5 font-semibold tracking-tight", first ? "text-2xl sm:text-[28px]" : "text-xl sm:text-2xl")}>
                <CountUp value={row.hours} decimals={2} suffix="h" delay={delay + 0.3} duration={1} />
              </p>
              <p className="mt-0.5 text-[11px] text-muted tnum sm:text-xs">
                {row.tasks_completed} {row.tasks_completed === 1 ? "task" : "tasks"} <span className="hidden sm:inline">·</span>
                <br className="sm:hidden" /> {onTimePct(row)}% on time
              </p>
            </motion.div>
            <motion.div
              className={cx(
                "flex w-full items-start justify-center overflow-hidden rounded-t-[26px]",
                first ? "card-accent" : "border border-b-0 border-line bg-gradient-to-b from-surface to-surface-2 shadow-[var(--shadow-sm)]",
              )}
              initial={reduce ? { height, opacity: 0 } : { height: 0, opacity: 1 }}
              animate={{ height, opacity: 1 }}
              transition={reduce ? { duration: 0.3, delay } : { type: "spring", stiffness: 120, damping: 14, delay }}
              style={first && !reduce ? { animation: "podium-glow 1.4s ease-out 1.5s forwards" } : undefined}
            >
              <span
                className={cx(
                  "relative z-[1] pt-3 text-[44px] font-extrabold leading-none tracking-tight tnum sm:text-[60px]",
                  first ? "text-[#111111]" : "text-accent-ink",
                )}
              >
                {rank}
              </span>
            </motion.div>
          </div>
        );
      })}
    </div>
  );
}

function PodiumSkeleton() {
  return (
    <div>
      <div className="mx-auto grid max-w-[760px] grid-cols-3 items-end gap-2 sm:gap-4">
        <Skeleton className="h-[150px] rounded-b-none" />
        <Skeleton className="h-[240px] rounded-b-none" />
        <Skeleton className="h-[110px] rounded-b-none" />
      </div>
      <Skeleton className="mt-10 h-[76px]" />
    </div>
  );
}
