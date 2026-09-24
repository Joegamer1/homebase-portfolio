"use client";

import { AttentionQueue } from "@/components/attention/attention-queue";
import { DomainOverview } from "@/components/home/domain-overview";
import { FocusPanel } from "@/components/home/focus-panel";
import { RecentChanges } from "@/components/home/recent-changes";
import { TodayPanel } from "@/components/home/today-panel";
import { ErrorState, Freshness, LoadingState } from "@/components/ui/data-state";
import { useHomeData } from "@/lib/use-home-data";

export default function HomePage() {
  const state = useHomeData();
  if (state.status === "loading") return <LoadingState />;
  if (state.status === "error") return <ErrorState message={state.message} />;
  const home = state.response.data;
  const urgentCount = home.attention.filter((item) => item.severity === "critical" || item.severity === "high").length;
  return (
    <div>
      <header className="mb-5">
        <h1 className="text-2xl font-semibold">Today</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          {urgentCount ? `${urgentCount} items need attention.` : "No urgent items."}
        </p>
      </header>
      <Freshness mode={home.mode} stale={home.stale} generatedAt={home.generatedAt} />
      <div className="mb-7">
        <DomainOverview items={home.attention} statuses={home.statuses} />
      </div>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
        <AttentionQueue items={home.attention} />
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-1">
          <TodayPanel events={home.today} outlook={home.calendarOutlook} />
          <FocusPanel goals={home.focus} />
        </div>
      </div>
      <div className="mt-4">
        <RecentChanges changes={home.changes} />
      </div>
    </div>
  );
}
