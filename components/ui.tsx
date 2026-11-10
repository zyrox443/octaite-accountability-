"use client";

import { AnimatePresence, animate, motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, Check, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import type { DisplayStatus } from "@/lib/types";
import { initials } from "@/lib/time";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------ */
/* Button                                                              */
/* ------------------------------------------------------------------ */
type Variant = "primary" | "secondary" | "ghost" | "danger";
const variants: Record<Variant, string> = {
  primary: "bg-accent text-on-accent border-accent hover:bg-accent-hover hover:border-accent-hover",
  secondary: "bg-surface text-ink border-line-strong hover:border-accent",
  ghost: "bg-transparent text-ink border-transparent hover:bg-surface-2",
  danger: "bg-surface text-danger border-danger-line hover:bg-danger-tint",
};

export function Button({
  variant = "secondary",
  size = "md",
  loading,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md"; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cx(
        "inline-flex items-center justify-center gap-2 border font-medium whitespace-nowrap select-none",
        "transition-[transform,background-color,border-color,opacity] duration-150",
        "hover:-translate-y-px active:translate-y-0 active:scale-[0.98] motion-reduce:transform-none",
        "disabled:opacity-50 disabled:pointer-events-none",
        size === "sm" ? "min-h-9 px-3 text-[13px]" : "min-h-11 px-4 text-sm",
        variants[variant],
        className,
      )}
    >
      {loading ? <span className="h-2 w-2 animate-pulse bg-current" aria-hidden /> : null}
      {children}
    </button>
  );
}

export function IconButton({
  label,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      {...rest}
      aria-label={label}
      title={label}
      className={cx(
        "inline-flex h-11 w-11 items-center justify-center border border-transparent text-ink",
        "transition-colors duration-150 hover:border-line hover:bg-surface-2 active:scale-95",
        className,
      )}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Form fields                                                         */
/* ------------------------------------------------------------------ */
export const inputClass =
  "w-full min-h-11 border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted " +
  "transition-colors duration-150 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 " +
  "disabled:opacity-60 aria-[invalid=true]:border-danger";

export function Field({
  label,
  error,
  hint,
  children,
  className,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: (props: { id: string; "aria-invalid": boolean; "aria-describedby"?: string }) => ReactNode;
  className?: string;
}) {
  const id = useId();
  const msgId = `${id}-msg`;
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-[13px] font-medium text-ink">
        {label}
      </label>
      {children({ id, "aria-invalid": !!error, "aria-describedby": error || hint ? msgId : undefined })}
      {error ? (
        <p id={msgId} className="text-[13px] text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={msgId} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Badges, avatar                                                      */
/* ------------------------------------------------------------------ */
const statusLabel: Record<DisplayStatus, string> = {
  pending: "Pending",
  submitted: "Awaiting approval",
  approved: "Approved",
  overdue: "Overdue",
  rejected: "Rejected",
};

export function statusBar(status: DisplayStatus): string {
  if (status === "rejected") return "var(--st-overdue-bar)";
  return `var(--st-${status}-bar)`;
}

export function StatusBadge({ status, late }: { status: DisplayStatus; late?: boolean }) {
  const style =
    status === "rejected"
      ? { color: "var(--st-overdue-fg)", borderColor: "var(--st-overdue-fg)", background: "transparent" }
      : { color: `var(--st-${status}-fg)`, background: `var(--st-${status}-bg)`, borderColor: "transparent" };
  return (
    <span className="inline-flex items-center gap-1.5">
      <motion.span
        layout="position"
        animate={style}
        initial={false}
        transition={{ duration: 0.25 }}
        className="inline-flex h-[22px] items-center gap-1 border px-2 text-[11px] font-semibold uppercase tracking-[0.06em] whitespace-nowrap"
      >
        {status === "approved" ? <ApprovedCheck /> : null}
        {statusLabel[status]}
      </motion.span>
      {late && (status === "approved" || status === "submitted") ? (
        <span
          className="inline-flex h-[22px] items-center border px-2 text-[11px] font-semibold uppercase tracking-[0.06em] whitespace-nowrap"
          style={{ color: "var(--st-overdue-fg)", borderColor: "var(--st-overdue-fg)" }}
        >
          Late
        </span>
      ) : null}
    </span>
  );
}

function ApprovedCheck() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden>
      <motion.path
        d="M5 12.5l4.5 4.5L19 7.5"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.4, ease: "easeOut", delay: 0.1 }}
      />
    </svg>
  );
}

export function Avatar({ name, size = 36, accent }: { name: string; size?: number; accent?: boolean }) {
  return (
    <span
      aria-hidden
      className={cx(
        "inline-flex flex-none items-center justify-center border font-semibold tnum",
        accent ? "border-accent bg-accent text-on-accent" : "border-line-strong bg-surface-2 text-ink",
      )}
      style={{ width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.36)) }}
    >
      {initials(name)}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* CountUp                                                             */
/* ------------------------------------------------------------------ */
export function CountUp({
  value,
  decimals = 0,
  duration = 0.9,
  delay = 0,
  suffix = "",
  replayKey,
}: {
  value: number;
  decimals?: number;
  duration?: number;
  delay?: number;
  suffix?: string;
  replayKey?: string | number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();
  const fmt = useCallback(
    (n: number) => {
      const s = n.toFixed(decimals);
      return (decimals > 0 ? s.replace(/\.?0+$/, "") : s) + suffix;
    },
    [decimals, suffix],
  );
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduce) {
      el.textContent = fmt(value);
      return;
    }
    const controls = animate(0, value, {
      duration,
      delay,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        el.textContent = fmt(v);
      },
    });
    return () => controls.stop();
  }, [value, duration, delay, reduce, fmt, replayKey]);
  return (
    <span ref={ref} className="tnum">
      {fmt(reduce ? value : 0)}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Cards, states                                                       */
/* ------------------------------------------------------------------ */
export function StatCard({
  label,
  value,
  decimals,
  suffix,
  context,
  primary,
  tone,
}: {
  label: string;
  value: number;
  decimals?: number;
  suffix?: string;
  context?: ReactNode;
  primary?: boolean;
  tone?: "danger";
}) {
  return (
    <div className={cx("lift relative border border-line bg-surface p-5", primary && "border-t-2 border-t-accent")}>
      <div className={cx("text-[32px] font-semibold leading-none tracking-tight", tone === "danger" && value > 0 && "text-danger")}>
        <CountUp value={value} decimals={decimals} suffix={suffix} />
      </div>
      <div className="mt-2 text-[13px] font-medium text-ink">{label}</div>
      {context ? <div className="mt-1 text-xs text-muted tnum">{context}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("skeleton", className)} aria-hidden />;
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center border border-dashed border-line-strong bg-surface px-6 py-12 text-center">
      <div className="flex h-11 w-11 items-center justify-center border border-line bg-surface-2 text-muted">{icon}</div>
      <h3 className="mt-4 text-base font-semibold">{title}</h3>
      {body ? <p className="mt-1 max-w-sm text-sm text-muted">{body}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center border border-danger-line bg-surface px-6 py-10 text-center" role="alert">
      <div className="flex h-11 w-11 items-center justify-center border border-danger-line bg-danger-tint text-danger">
        <AlertTriangle size={20} />
      </div>
      <h3 className="mt-4 text-base font-semibold">Something went wrong</h3>
      <p className="mt-1 max-w-md text-sm text-muted">{message}</p>
      {onRetry ? (
        <Button className="mt-5" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-[28px] font-semibold leading-tight sm:text-[30px]">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted tnum">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function SectionTitle({ children, count, tone }: { children: ReactNode; count?: number; tone?: "danger" }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      {tone === "danger" ? <span className="pulse-dot" aria-hidden /> : null}
      <h2 className={cx("text-lg font-semibold", tone === "danger" && "text-danger")}>{children}</h2>
      {count !== undefined ? (
        <span className="border border-line bg-surface-2 px-1.5 text-xs font-medium text-muted tnum">{count}</span>
      ) : null}
    </div>
  );
}

/* Staggered list container + item */
export const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
};
export const staggerItem = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" as const } },
};

/* ------------------------------------------------------------------ */
/* Modal and Drawer                                                    */
/* ------------------------------------------------------------------ */
function useOverlay(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = 520,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  useOverlay(open, onClose);
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-backdrop sm:items-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="flex max-h-[92dvh] w-full flex-col border border-line bg-surface"
            style={{ maxWidth: width }}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            <div className="flex items-center justify-between border-b border-line py-2 pl-5 pr-2">
              <h2 className="text-lg font-semibold">{title}</h2>
              <IconButton label="Close" onClick={onClose}>
                <X size={18} />
              </IconButton>
            </div>
            <div className="overflow-y-auto p-5">{children}</div>
            {footer ? <div className="flex flex-wrap justify-end gap-2 border-t border-line p-4">{footer}</div> : null}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useOverlay(open, onClose);
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 bg-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="absolute inset-y-0 right-0 flex w-full max-w-[560px] flex-col border-l border-line bg-surface"
            initial={{ x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 40, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
          >
            <div className="flex items-center justify-between border-b border-line py-2 pl-5 pr-2">
              <h2 className="truncate text-lg font-semibold">{title}</h2>
              <IconButton label="Close" onClick={onClose}>
                <X size={18} />
              </IconButton>
            </div>
            <div className="flex-1 overflow-y-auto p-5">{children}</div>
            {footer ? <div className="flex flex-wrap justify-end gap-2 border-t border-line p-4">{footer}</div> : null}
          </motion.aside>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ */
/* Toasts                                                              */
/* ------------------------------------------------------------------ */
type Toast = { id: number; title: string; body?: string; tone?: "success" | "error" | "info" };
const ToastCtx = createContext<(t: Omit<Toast, "id">) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((list) => [...list.slice(-3), { ...t, id }]);
    setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), 5000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed right-3 top-[68px] z-[60] flex w-[min(360px,calc(100vw-24px))] flex-col gap-2" aria-live="polite">
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, x: 24, y: -8 }}
              animate={{ opacity: 1, x: 0, y: 0 }}
              exit={{ opacity: 0, x: 24 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className={cx(
                "pointer-events-auto flex items-start gap-3 border border-l-2 border-line bg-surface p-3",
                t.tone === "error" ? "border-l-danger" : t.tone === "success" ? "border-l-success" : "border-l-accent",
              )}
              role="status"
            >
              <span className={cx("mt-0.5", t.tone === "error" ? "text-danger" : t.tone === "success" ? "text-success" : "text-accent-ink")}>
                {t.tone === "error" ? <AlertTriangle size={16} /> : <Check size={16} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{t.title}</p>
                {t.body ? <p className="mt-0.5 break-words text-[13px] text-muted">{t.body}</p> : null}
              </div>
              <button
                aria-label="Dismiss"
                className="text-muted hover:text-ink"
                onClick={() => setToasts((list) => list.filter((x) => x.id !== t.id))}
              >
                <X size={14} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}
