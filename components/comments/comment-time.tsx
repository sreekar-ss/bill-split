"use client";

import { useSyncExternalStore } from "react";

const MINUTE = 60_000;

// Re-render once a minute so "just now" doesn't go stale while the page is open.
function subscribe(onTick: () => void) {
  const timer = window.setInterval(onTick, MINUTE);
  return () => window.clearInterval(timer);
}
const currentMinute = () => Math.floor(Date.now() / MINUTE);
const noMinute = () => null;

const SHORT_UTC: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", timeZone: "UTC" };

/** "just now", "5 min ago", "3 h ago", "yesterday", then a short date ("Mar 4", "Mar 4, 2025"). */
export function relativeTime(date: Date, now: Date): string {
  const diff = now.getTime() - date.getTime();
  if (diff < MINUTE) return "just now";
  if (diff < 60 * MINUTE) return `${Math.floor(diff / MINUTE)} min ago`;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (date.getTime() >= startOfToday) return `${Math.floor(diff / (60 * MINUTE))} h ago`;
  if (date.getTime() >= startOfToday - 24 * 60 * MINUTE) return "yesterday";
  const sameYear = date.getFullYear() === now.getFullYear();
  return new Intl.DateTimeFormat("en-US", sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" }).format(date);
}

/**
 * When a comment was posted. The server (and the first client render) prints a short UTC date so
 * hydration matches; after that it switches to local, relative time with the full date as a tooltip.
 */
export function CommentTime({ date }: { date: Date | string }) {
  const minute = useSyncExternalStore(subscribe, currentMinute, noMinute);
  const d = new Date(date);
  const label = minute == null ? new Intl.DateTimeFormat("en-US", SHORT_UTC).format(d) : relativeTime(d, new Date());
  const full = minute == null ? undefined : new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(d);
  return (
    <time dateTime={d.toISOString()} title={full} className="num">
      {label}
    </time>
  );
}
