"use client";

import { MotionConfig } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Notification, Profile } from "@/lib/types";
import { ToastProvider, useToast } from "./ui";

/* ------------------------------------------------------------------ */
/* Theme                                                               */
/* ------------------------------------------------------------------ */
type Theme = "light" | "dark";
const ThemeCtx = createContext<{ theme: Theme; toggle: () => void }>({ theme: "light", toggle: () => {} });
export const useTheme = () => useContext(ThemeCtx);

/** Runs before first paint (inlined in <head>) so there is no theme flash. */
export const themeScript = `(function(){try{var t=localStorage.getItem('theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}if(t==='dark')document.documentElement.classList.add('dark')}catch(e){}})()`;

function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");
  useEffect(() => {
    setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
  }, []);
  const toggle = useCallback(() => {
    const root = document.documentElement;
    const next: Theme = root.classList.contains("dark") ? "light" : "dark";
    root.classList.add("theme-switching");
    root.classList.toggle("dark", next === "dark");
    try {
      localStorage.setItem("theme", next);
    } catch {}
    setTheme(next);
    window.setTimeout(() => root.classList.remove("theme-switching"), 260);
  }, []);
  return <ThemeCtx.Provider value={{ theme, toggle }}>{children}</ThemeCtx.Provider>;
}

export function RootProviders({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <ThemeProvider>
        <ToastProvider>{children}</ToastProvider>
      </ThemeProvider>
    </MotionConfig>
  );
}

/* ------------------------------------------------------------------ */
/* Auth                                                                */
/* ------------------------------------------------------------------ */
type AuthState = {
  profile: Profile | null;
  loading: boolean;
  error: string | null;
  signOut: () => Promise<void>;
};
const AuthCtx = createContext<AuthState>({ profile: null, loading: true, error: null, signOut: async () => {} });
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const signOut = useCallback(async () => {
    await supabaseBrowser().auth.signOut();
    router.replace("/login");
  }, [router]);

  useEffect(() => {
    const sb = supabaseBrowser();
    let cancelled = false;
    (async () => {
      const {
        data: { user },
      } = await sb.auth.getUser();
      if (cancelled) return;
      if (!user) {
        router.replace("/login");
        return;
      }
      const { data, error: err } = await sb.from("profiles").select("*").eq("id", user.id).maybeSingle();
      if (cancelled) return;
      if (err) {
        setError(err.message);
      } else if (!data || !data.is_active) {
        await sb.auth.signOut();
        router.replace("/login?reason=inactive");
        return;
      } else {
        setProfile(data as Profile);
      }
      setLoading(false);
    })();
    const { data: sub } = sb.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") router.replace("/login");
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [router]);

  const value = useMemo(() => ({ profile, loading, error, signOut }), [profile, loading, error, signOut]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

/* ------------------------------------------------------------------ */
/* Realtime helper                                                     */
/* ------------------------------------------------------------------ */
let channelSeq = 0;
/** Calls `onChange` (debounced) whenever any row in the given tables changes. */
export function useTableChanges(tables: string[], onChange: () => void, enabled = true) {
  const cb = useRef(onChange);
  useEffect(() => {
    cb.current = onChange;
  });
  const key = tables.join(",");
  useEffect(() => {
    if (!enabled) return;
    const sb = supabaseBrowser();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let channel = sb.channel(`changes-${key}-${++channelSeq}`);
    for (const table of key.split(",")) {
      channel = channel.on("postgres_changes", { event: "*", schema: "public", table }, () => {
        clearTimeout(timer);
        timer = setTimeout(() => cb.current(), 250);
      });
    }
    channel.subscribe();
    return () => {
      clearTimeout(timer);
      sb.removeChannel(channel);
    };
  }, [key, enabled]);
}

/** Re-renders every `ms` so "overdue by" counters stay current. */
export function useTick(ms = 30000) {
  const [, set] = useState(0);
  useEffect(() => {
    const id = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
}

/* ------------------------------------------------------------------ */
/* Notifications                                                       */
/* ------------------------------------------------------------------ */
type NotifState = {
  items: Notification[];
  unread: number;
  shake: number;
  markRead: (id: string) => void;
  markAllRead: () => void;
};
const NotifCtx = createContext<NotifState>({ items: [], unread: 0, shake: 0, markRead: () => {}, markAllRead: () => {} });
export const useNotifications = () => useContext(NotifCtx);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState<Notification[]>([]);
  const [shake, setShake] = useState(0);
  const uid = profile?.id;

  useEffect(() => {
    if (!uid) return;
    const sb = supabaseBrowser();
    let active = true;
    sb.from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(40)
      .then(({ data }) => {
        if (active && data) setItems(data as Notification[]);
      });
    // Make sure nothing is stale the moment the app opens.
    sb.rpc("mark_overdue_tasks").then(() => {});

    const channel = sb
      .channel(`notifications-${uid}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_id=eq.${uid}` },
        (payload) => {
          const n = payload.new as Notification;
          setItems((list) => (list.some((x) => x.id === n.id) ? list : [n, ...list].slice(0, 60)));
          setShake((s) => s + 1);
          toast({ title: n.title, body: n.body, tone: n.type === "task_approved" ? "success" : n.type === "task_submitted" || n.type === "reminder" || n.type === "signup_request" ? "info" : "error" });
        },
      )
      .subscribe();
    return () => {
      active = false;
      sb.removeChannel(channel);
    };
  }, [uid, toast]);

  const markRead = useCallback((id: string) => {
    const now = new Date().toISOString();
    setItems((list) => list.map((n) => (n.id === id && !n.read_at ? { ...n, read_at: now } : n)));
    supabaseBrowser().from("notifications").update({ read_at: now }).eq("id", id).is("read_at", null).then(() => {});
  }, []);
  const markAllRead = useCallback(() => {
    const now = new Date().toISOString();
    setItems((list) => list.map((n) => (n.read_at ? n : { ...n, read_at: now })));
    supabaseBrowser().from("notifications").update({ read_at: now }).is("read_at", null).then(() => {});
  }, []);

  const unread = items.filter((n) => !n.read_at).length;
  const value = useMemo(() => ({ items, unread, shake, markRead, markAllRead }), [items, unread, shake, markRead, markAllRead]);
  return <NotifCtx.Provider value={value}>{children}</NotifCtx.Provider>;
}
