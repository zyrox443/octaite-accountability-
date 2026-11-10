// All dates in the app are shown and entered in Pakistan Standard Time.
// PKT is UTC+5 all year (no daylight saving), so a fixed offset is exact.
export const TZ = "Asia/Karachi";
const OFFSET = "+05:00";

const dateFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const timeFmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true });
const hmFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });
const dayFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" });
const longDayFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" });

/** "2026-11-10" for the given instant (default: now) in PKT. */
export function pkDate(d: Date | string = new Date()): string {
  return dateFmt.format(typeof d === "string" ? new Date(d) : d);
}
/** "14:05" in PKT. */
export function pkHM(d: Date | string = new Date()): string {
  return hmFmt.format(typeof d === "string" ? new Date(d) : d);
}
/** "2:05 PM" */
export function fmtTime(iso: string): string {
  return timeFmt.format(new Date(iso));
}
/** "Tue, 10 Nov" */
export function fmtDay(iso: string | Date): string {
  return dayFmt.format(typeof iso === "string" ? new Date(iso) : iso);
}
export function fmtLongDay(d: Date = new Date()): string {
  return longDayFmt.format(d);
}
/** "Tue, 10 Nov, 2:05 PM" - drops the day when it is today. */
export function fmtDateTime(iso: string, alwaysDay = false): string {
  if (!alwaysDay && pkDate(iso) === pkDate()) return `Today, ${fmtTime(iso)}`;
  return `${fmtDay(iso)}, ${fmtTime(iso)}`;
}
/** Combine a PKT date and time from form inputs into an ISO instant. */
export function pkToISO(date: string, time: string): string {
  return new Date(`${date}T${time}:00${OFFSET}`).toISOString();
}
/** Start of a PKT calendar day as an ISO instant. */
export function pkDayStart(date: string): string {
  return pkToISO(date, "00:00");
}
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00${OFFSET}`);
  d.setUTCDate(d.getUTCDate() + days);
  return pkDate(d);
}
/** "3h 20m", "2d 4h", "12m" */
export function fmtDuration(ms: number): string {
  const mins = Math.max(0, Math.floor(ms / 60000));
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
export function fmtHours(n: number): string {
  return Number.isInteger(n) ? `${n}` : n.toFixed(2).replace(/0$/, "");
}
export function fmtRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return "Just now";
  if (diff < 86400000) return `${fmtDuration(diff)} ago`;
  return fmtDay(iso);
}
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}
export function fmtBytes(n: number | null): string {
  if (!n) return "";
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
