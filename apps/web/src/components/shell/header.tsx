"use client";

import { useSyncExternalStore } from "react";

const subscribeToClock = (notify: () => void) => {
  const timer = setInterval(notify, 1000);
  return () => clearInterval(timer);
};
const currentMinute = () => Math.floor(Date.now() / 60000);
const serverMinute = () => null;

export function Header() {
  const minute = useSyncExternalStore<number | null>(subscribeToClock, currentMinute, serverMinute);
  const now = minute === null ? undefined : new Date(minute * 60000);
  const day = now
    ? new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "2-digit" }).format(now)
    : "—";
  const time = now
    ? new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }).format(now)
    : "—";

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--bg)_88%,transparent)] px-4 backdrop-blur-xl sm:px-6 lg:h-16 lg:px-8">
      <div className="flex items-center gap-3 lg:hidden">
        <span className="mono text-xs font-bold tracking-[0.14em]">HOMEBASE</span>
      </div>
      <div className="hidden items-center gap-2 text-xs text-[var(--muted)] lg:flex">
        <span className="status-dot bg-[var(--green)] text-[var(--green)]" />
        <span className="mono">PRIVATE COMMAND CENTER</span>
        <span className="text-[var(--line-bright)]">/</span>
        <span className="mono">HOMEBASE</span>
      </div>
      <time className="mono text-[11px] uppercase tracking-[0.1em] text-[var(--muted)]" dateTime={now?.toISOString()}>
        {day} <span className="ml-2 text-[var(--text)]">{time}</span>
      </time>
    </header>
  );
}
