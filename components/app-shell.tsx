"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Bell, CheckCheck, LogOut, Menu, Moon, Sun, Trash2, UserRound, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { fmtRelative } from "@/lib/time";
import type { Notification } from "@/lib/types";
import { AuthProvider, NotificationsProvider, useAuth, useNotifications, useTheme } from "./providers";
import { PresenceProvider, RunningBar, usePresence } from "./presence";
import { Avatar, Button, ErrorState, IconButton, Modal, Skeleton, cx } from "./ui";
import { supabaseBrowser } from "@/lib/supabase/client";

const memberLinks = [
  { href: "/my-day", label: "My Day" },
  { href: "/leaderboard", label: "Leaderboard" },
];
const adminLinks = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/approvals", label: "Approvals" },
  { href: "/admin/team", label: "Team" },
  { href: "/admin/settings", label: "Settings" },
];

function isActive(path: string, href: string) {
  if (href === "/admin") return path === "/admin";
  return path === href || path.startsWith(href + "/");
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <NotificationsProvider>
        <PresenceProvider>
          <Shell>{children}</Shell>
        </PresenceProvider>
      </NotificationsProvider>
    </AuthProvider>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const { profile, loading, error } = useAuth();
  const path = usePathname();
  const router = useRouter();
  const isAdminRoute = path.startsWith("/admin");
  const adminOnMyDay = !!profile && profile.role === "admin" && path === "/my-day";
  const blocked = (!!profile && isAdminRoute && profile.role !== "admin") || adminOnMyDay;

  useEffect(() => {
    if (blocked) router.replace(adminOnMyDay ? "/admin" : "/my-day");
  }, [blocked, adminOnMyDay, router]);

  return (
    <div className="flex min-h-dvh flex-col">
      <TopNav />
      <RunningBar />
      <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {error ? (
          <ErrorState message={error} onRetry={() => window.location.reload()} />
        ) : loading || blocked ? (
          <ShellSkeleton />
        ) : (
          <motion.div
            key={path}
            initial={{ opacity: 0, y: 16, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          >
            {children}
          </motion.div>
        )}
      </main>
    </div>
  );
}

export function ShellSkeleton() {
  return (
    <div>
      <Skeleton className="h-9 w-48" />
      <Skeleton className="mt-2 h-4 w-64" />
      <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[112px]" />
        ))}
      </div>
      <div className="mt-8 flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[84px]" />
        ))}
      </div>
    </div>
  );
}

/** Asks before signing out while a task is running, because it would be discarded. */
function useGuardedSignOut() {
  const { signOut } = useAuth();
  const { runningTask } = usePresence();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const request = () => (runningTask ? setAsking(true) : signOut());
  const dialog = (
    <Modal
      open={asking}
      onClose={() => setAsking(false)}
      title="A task is still running"
      width={460}
      footer={
        <>
          <Button onClick={() => setAsking(false)}>Stay</Button>
          <Button variant="danger" onClick={signOut}>
            Sign out anyway
          </Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              if (runningTask) await supabaseBrowser().rpc("pause_task", { p_task_id: runningTask.id });
              await signOut();
            }}
          >
            Pause task and sign out
          </Button>
        </>
      }
    >
      <p className="text-sm">
        <span className="font-semibold">{runningTask?.title}</span> is running. If you leave the app while it is running, the task will be
        discarded and you will have to add it again.
      </p>
      <p className="mt-2 text-[13px] text-muted">Pause it first to keep the time you have worked.</p>
    </Modal>
  );
  return { request, dialog };
}

function TopNav() {
  const { profile } = useAuth();
  const { request: signOut, dialog: signOutDialog } = useGuardedSignOut();
  const path = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const links = profile ? (profile.role === "admin" ? [adminLinks[0], adminLinks[1], adminLinks[2], memberLinks[1], adminLinks[3]] : memberLinks) : [];

  useEffect(() => setMenuOpen(false), [path]);
  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-40 px-3 pt-3 sm:px-6 lg:px-8">
      <div className="floating mx-auto flex h-[60px] max-w-[1280px] items-center gap-2 rounded-full pl-3 pr-2">
        <Link href={profile?.role === "admin" ? "/admin" : "/my-day"} className="flex min-h-11 items-center gap-2.5 pr-2" aria-label="Octaite Accountability home">
          <span className="btn-primary flex h-8 w-8 items-center justify-center rounded-[10px] text-[13px] font-bold">O</span>
          <span className="text-[15px] font-semibold tracking-tight">Octaite Accountability</span>
        </Link>

        <nav className="mx-auto hidden h-full items-stretch lg:flex" aria-label="Main">
          {links.map((l) => {
            const active = isActive(path, l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "relative my-2.5 flex items-center rounded-full px-4 text-sm font-medium transition-colors",
                  active ? "text-accent-ink" : "text-muted hover:text-ink",
                )}
              >
                {active ? (
                  <motion.span
                    layoutId="nav-pill"
                    className="absolute inset-0 rounded-full bg-accent-tint ring-1 ring-inset ring-accent/25"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                ) : null}
                <span className="relative">{l.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center lg:ml-0">
          {profile ? <NotificationBell /> : null}
          <ThemeToggle />
          {profile ? <UserMenu className="hidden lg:block" onSignOut={signOut} /> : null}
          <IconButton label="Open menu" className="lg:hidden" onClick={() => setMenuOpen(true)} aria-expanded={menuOpen}>
            <Menu size={20} />
          </IconButton>
        </div>
      </div>

      <AnimatePresence>
        {menuOpen ? (
          <motion.div
            className="fixed inset-0 z-50 bg-backdrop backdrop-blur-[3px] lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={(e) => e.target === e.currentTarget && setMenuOpen(false)}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Menu"
              className="absolute inset-y-2 right-2 flex w-[min(320px,86vw)] flex-col overflow-hidden rounded-[28px] border border-line bg-surface shadow-[var(--shadow-lg)]"
              initial={{ x: "110%" }}
              animate={{ x: 0 }}
              exit={{ x: "110%" }}
              transition={{ type: "spring", stiffness: 340, damping: 34 }}
            >
              <div className="flex h-14 items-center justify-between border-b border-line pl-5 pr-2">
                <span className="text-sm font-semibold">Menu</span>
                <IconButton label="Close menu" onClick={() => setMenuOpen(false)}>
                  <X size={20} />
                </IconButton>
              </div>
              <nav className="flex flex-1 flex-col overflow-y-auto py-2" aria-label="Mobile">
                {links.map((l) => {
                  const active = isActive(path, l.href);
                  return (
                    <Link
                      key={l.href}
                      href={l.href}
                      aria-current={active ? "page" : undefined}
                      className={cx(
                        "mx-2 flex min-h-12 items-center rounded-2xl px-4 text-[15px] font-medium",
                        active ? "bg-accent-tint text-accent-ink" : "text-muted",
                      )}
                    >
                      {l.label}
                    </Link>
                  );
                })}
              </nav>
              {profile ? (
                <div className="border-t border-line p-4">
                  <div className="flex items-center gap-3">
                    <Avatar name={profile.full_name} src={profile.avatar_url} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{profile.full_name}</p>
                      <p className="truncate text-xs text-muted">{profile.title || profile.email}</p>
                    </div>
                  </div>
                  <Link href="/profile" className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-line-strong text-sm font-medium">
                    <UserRound size={16} /> Edit profile
                  </Link>
                  <button
                    onClick={signOut}
                    className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-line-strong text-sm font-medium"
                  >
                    <LogOut size={16} /> Sign out
                  </button>
                </div>
              ) : null}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
      {signOutDialog}
    </header>
  );
}

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <IconButton label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} onClick={toggle}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={theme}
          initial={{ rotate: -90, opacity: 0 }}
          animate={{ rotate: 0, opacity: 1 }}
          exit={{ rotate: 90, opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="flex"
        >
          {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
        </motion.span>
      </AnimatePresence>
    </IconButton>
  );
}

function useClickOutside(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}

function UserMenu({ className, onSignOut }: { className?: string; onSignOut: () => void }) {
  const { profile } = useAuth();
  const signOut = () => {
    setOpen(false);
    onSignOut();
  };
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(open, () => setOpen(false));
  if (!profile) return null;
  return (
    <div className={cx("relative ml-1", className)} ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Account menu"
        aria-expanded={open}
        className="flex h-11 w-11 items-center justify-center"
      >
        <Avatar name={profile.full_name} size={32} src={profile.avatar_url} />
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 460, damping: 32 }}
            style={{ transformOrigin: "top right" }}
            className="floating absolute right-0 top-[calc(100%+10px)] w-64 overflow-hidden rounded-2xl"
          >
            <div className="border-b border-line p-3">
              <p className="truncate text-sm font-medium">{profile.full_name}</p>
              <p className="truncate text-xs text-muted">{profile.email}</p>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-accent-ink">
                {profile.role === "admin" ? "Admin" : profile.title || "Member"}
              </p>
            </div>
            <Link href="/profile" onClick={() => setOpen(false)} className="flex min-h-11 w-full items-center gap-2 px-3 text-sm hover:bg-surface-2">
              <UserRound size={16} /> Edit profile
            </Link>
            <button onClick={signOut} className="flex min-h-11 w-full items-center gap-2 px-3 text-sm hover:bg-surface-2">
              <LogOut size={16} /> Sign out
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function notifHref(n: Notification, admin: boolean) {
  if (!admin) return "/my-day";
  if (n.type === "signup_request") return "/admin/team";
  if (n.type === "task_discarded" && n.subject_user_id) return `/admin/team/${n.subject_user_id}`;
  if (n.type === "task_submitted") return "/admin/approvals";
  if (n.type === "no_plan" && n.subject_user_id) return `/admin/team/${n.subject_user_id}`;
  return "/admin";
}

function NotificationBell() {
  const { profile } = useAuth();
  const { items, unread, shake, markRead, markAllRead, clearAll } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(open, () => setOpen(false));
  const router = useRouter();
  const admin = profile?.role === "admin";

  return (
    <div className="relative" ref={ref}>
      <IconButton
        label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="relative"
      >
        <motion.span
          key={shake}
          className="flex origin-top"
          animate={shake ? { rotate: [0, -16, 13, -9, 6, 0] } : undefined}
          transition={{ duration: 0.55 }}
        >
          <Bell size={18} />
        </motion.span>
        <AnimatePresence>
          {unread > 0 ? (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="absolute right-0.5 top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#dc2626] ring-2 ring-surface px-1 text-[11px] font-semibold leading-none text-white tnum"
            >
              {unread > 99 ? "99+" : unread}
            </motion.span>
          ) : null}
        </AnimatePresence>
      </IconButton>
      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 460, damping: 32 }}
            style={{ transformOrigin: "top right" }}
            className="fixed inset-x-3 top-[76px] z-50 flex max-h-[70dvh] flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-[var(--shadow-lg)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-[calc(100%+10px)] sm:w-[380px]"
          >
            <div className="flex items-center justify-between border-b border-line py-1 pl-4 pr-1">
              <span className="text-sm font-semibold">Notifications</span>
              <div className="flex items-center">
                <button
                  onClick={markAllRead}
                  disabled={!unread}
                  className="flex min-h-11 items-center gap-1.5 px-2.5 text-[13px] font-medium text-accent-ink disabled:text-muted disabled:opacity-60"
                >
                  <CheckCheck size={15} /> Mark all read
                </button>
                <button
                  onClick={clearAll}
                  disabled={!items.length}
                  className="flex min-h-11 items-center gap-1.5 px-2.5 text-[13px] font-medium text-muted hover:text-danger disabled:opacity-60"
                >
                  <Trash2 size={14} /> Clear all
                </button>
              </div>
            </div>
            <div className="overflow-y-auto">
              {items.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-muted">You are all caught up.</p>
              ) : (
                items.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => {
                      markRead(n.id);
                      setOpen(false);
                      router.push(notifHref(n, !!admin));
                    }}
                    className={cx(
                      "flex w-full items-start gap-3 border-b border-line px-4 py-3 text-left last:border-b-0 hover:bg-surface-2",
                      !n.read_at && "bg-accent-tint",
                    )}
                  >
                    <span
                      className="mt-1.5 h-2 w-2 flex-none rounded-full"
                      style={{
                        background: n.read_at
                          ? "transparent"
                          : n.type === "task_approved"
                            ? "var(--st-approved-bar)"
                            : n.type === "task_submitted"
                              ? "var(--st-submitted-bar)"
                              : "var(--st-overdue-bar)",
                      }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-semibold">{n.title}</span>
                      <span className="mt-0.5 block break-words text-[13px] text-muted">{n.body}</span>
                      <span className="mt-1 block text-xs text-muted tnum">{fmtRelative(n.created_at)}</span>
                    </span>
                  </button>
                ))
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
