"use client";

import Link from "next/link";
import { ErrorState, Freshness, LoadingState } from "@/components/ui/data-state";
import { PageHeading } from "@/components/ui/page-heading";
import { useHomeData } from "@/lib/use-home-data";

type Workspace = "lab" | "security" | "career" | "games" | "family" | "system";
const copy = {
  lab: ["02", "Lab operations", "Live integration alerts and collection freshness across your home systems."],
  security: ["03", "Security intelligence", "High-signal advisories prioritized against the technology inventory."],
  career: [
    "04",
    "Career radar",
    "Cybersecurity roles above the $60k current base in Dayton, Columbus, Cincinnati, or remote.",
  ],
  games: [
    "05",
    "Game intelligence",
    "Tracked-character changes led by official sources, with trusted and community context as fallback.",
  ],
  family: ["06", "Family overview", "Upcoming commitments and selected home exceptions, kept private and read-only."],
  system: ["07", "System control", "Collector freshness, connection status, and runtime health."],
} satisfies Record<Workspace, [string, string, string]>;

export function WorkspaceClient({ workspace }: { workspace: Workspace }) {
  const state = useHomeData();
  if (state.status === "loading") return <LoadingState />;
  if (state.status === "error") return <ErrorState message={state.message} />;
  const home = state.response.data;
  const [number, title, description] = copy[workspace];
  return (
    <div>
      <PageHeading eyebrow={`Workspace / ${number}`} title={title} description={description} />
      <Freshness mode={home.mode} stale={home.stale} generatedAt={home.generatedAt} />
      {workspace === "lab" && <Lab data={home} />}
      {workspace === "security" && <Security data={home} />}
      {workspace === "career" && <Career data={home} />}
      {workspace === "games" && !home.games.length && (
        <p className="panel p-4 text-sm text-[var(--muted)]">Game sources are not connected yet.</p>
      )}
      {workspace === "games" && <Games data={home} />}
      {workspace === "family" && !home.family.length && (
        <p className="panel p-4 text-sm text-[var(--muted)]">Calendar and family sources are not connected yet.</p>
      )}
      {workspace === "family" && <Family data={home} />}
      {workspace === "system" && <System data={home} />}
    </div>
  );
}

type Payload = import("@homebase/api-contracts").HomeResponse["data"];
const stateColor = { healthy: "var(--green)", warning: "var(--amber)", critical: "var(--red)" };

function Lab({ data }: { data: Payload }) {
  return (
    <>
      <Link
        href="/lab/proxmox"
        className="panel mb-4 flex items-center justify-between p-4 transition hover:border-[var(--cyan)]"
      >
        <div>
          <div className="section-label text-[var(--text)]">Proxmox infrastructure</div>
          <div className="mt-1 text-[11px] text-[var(--muted)]">
            Nodes, guests, storage, tasks, and collection health
          </div>
        </div>
        <span className="mono text-[9px] text-[var(--cyan)]">OPEN →</span>
      </Link>
      <Link href="/lab/services" className="panel mb-4 block p-4 text-sm">
        Docker containers & Uptime Kuma service health →
      </Link>
      <Link href="/lab/home-systems" className="panel mb-4 block p-4 text-sm">
        Pi-hole, Plex, Home Assistant & Tailscale →
      </Link>
      {!data.lab.length && (
        <p className="panel mb-4 p-4 text-sm text-[var(--muted)]">
          Waiting for live lab telemetry. Open an integration above for its connection status.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {data.lab.map((metric) => (
          <section key={metric.id} className="panel p-4">
            <div className="section-label">{metric.label}</div>
            <div className="mono mt-5 text-2xl" style={{ color: stateColor[metric.status] }}>
              {metric.value}
              {metric.unit}
            </div>
            <div className="mono mt-2 text-[9px] uppercase text-[var(--faint)]">
              {metric.stale ? "Out of date" : metric.status}
            </div>
          </section>
        ))}
      </div>
      <section className="panel mt-4">
        <div className="border-b border-[var(--line)] px-4 py-3">
          <h2 className="section-label text-[var(--text)]">Recently added to Plex</h2>
        </div>
        {!data.media.length && (
          <p className="p-4 text-xs text-[var(--muted)]">
            Recent library additions are not collected yet. Live Plex sessions are available in Home Systems.
          </p>
        )}
        {data.media.map((item) => (
          <div key={item.id} className="flex justify-between border-b border-[var(--line)] px-4 py-3 last:border-0">
            <div>
              <div className="text-xs">{item.title}</div>
              <div className="mt-1 text-[9px] text-[var(--muted)]">{item.detail}</div>
            </div>
            <span className="mono text-[8px] text-[var(--faint)]">{item.age}</span>
          </div>
        ))}
      </section>
    </>
  );
}

function Security({ data }: { data: Payload }) {
  const items = data.attention.filter((item) => item.domain === "security");
  return (
    <section className="panel">
      <div className="border-b border-[var(--line)] px-4 py-3">
        <h2 className="section-label text-[var(--text)]">Relevant signals</h2>
      </div>
      {items.map((item) => (
        <article key={item.id} className="px-4 py-4">
          <div className="mono text-[9px] text-[var(--red)]">
            {item.severity.toUpperCase()} · SCORE {item.score}
          </div>
          <h3 className="mt-2 text-sm">{item.title}</h3>
          <p className="mt-1 text-[11px] text-[var(--muted)]">{item.summary}</p>
          <p className="mono mt-2 text-[9px] text-[var(--faint)]">WHY: {item.explanation}</p>
        </article>
      ))}
    </section>
  );
}

function Career({ data }: { data: Payload }) {
  return (
    <>
      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        {[
          ["CURRENT BASE", "$60k"],
          ["MINIMUM", "$65k"],
          ["PREFERRED", "$80k+"],
          ["MARKETS", "3 + REMOTE"],
        ].map(([label, value]) => (
          <section className="panel p-4" key={label}>
            <div className="section-label">{label}</div>
            <div className="mono mt-4 text-xl text-[var(--cyan)]">{value}</div>
          </section>
        ))}
      </div>
      <section className="panel overflow-hidden">
        <div className="border-b border-[var(--line)] px-4 py-3">
          <h2 className="section-label text-[var(--text)]">Ranked opportunities</h2>
        </div>
        {data.jobs.map((job) => (
          <article
            key={job.id}
            className="grid gap-3 border-b border-[var(--line)] px-4 py-4 md:grid-cols-[1fr_130px_120px]"
          >
            <div>
              <h3 className="text-[13px]">{job.title}</h3>
              <div className="mt-1 text-[11px] text-[var(--muted)]">
                {job.company} · {job.location} · {job.arrangement}
              </div>
              <div className="mono mt-2 text-[9px] text-[var(--green)]">{job.reasons.join(" · ")}</div>
              {job.gaps.length > 0 && (
                <div className="mono mt-1 text-[9px] text-[var(--amber)]">CHECK: {job.gaps.join(" · ")}</div>
              )}
            </div>
            <div className="mono text-[11px] md:text-right">{job.salary}</div>
            <div className="mono text-[9px] md:text-right">
              <span className="text-[var(--green)]">{job.matchScore} MATCH</span>
              <br />
              <span className="text-[var(--violet)]">{job.careerValueScore} CAREER VALUE</span>
            </div>
          </article>
        ))}
      </section>
    </>
  );
}

function Games({ data }: { data: Payload }) {
  const tierColor = { official: "var(--green)", trusted: "var(--cyan)", community: "var(--amber)" };
  return (
    <section className="panel">
      <div className="flex justify-between border-b border-[var(--line)] px-4 py-3">
        <h2 className="section-label text-[var(--text)]">Relevant updates</h2>
        <span className="mono text-[9px] text-[var(--faint)]">OFFICIAL → TRUSTED → COMMUNITY</span>
      </div>
      {data.games.map((item) => (
        <article
          key={item.id}
          className="grid gap-3 border-b border-[var(--line)] px-4 py-4 sm:grid-cols-[120px_1fr_100px]"
        >
          <div className="mono text-[9px] text-[var(--muted)]">
            {item.game}
            <div className="mt-1 text-[var(--faint)]">{item.affected.join(" · ")}</div>
          </div>
          <div>
            <h3 className="text-xs">{item.title}</h3>
            <p className="mt-1 text-[11px] text-[var(--muted)]">{item.summary}</p>
          </div>
          <div className="mono text-[8px] uppercase sm:text-right" style={{ color: tierColor[item.tier] }}>
            ● {item.tier}
            <div className="mt-1 text-[var(--faint)]">{item.source}</div>
          </div>
        </article>
      ))}
    </section>
  );
}

function Family({ data }: { data: Payload }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="panel">
        <div className="border-b border-[var(--line)] px-4 py-3">
          <h2 className="section-label text-[var(--text)]">Today</h2>
        </div>
        {data.today.map((item) => (
          <div key={item.id} className="grid grid-cols-[55px_1fr] border-b border-[var(--line)] px-4 py-3">
            <span className="mono text-[9px] text-[var(--cyan)]">{item.time}</span>
            <div className="text-xs">
              {item.title}
              <div className="mt-1 text-[9px] text-[var(--faint)]">{item.meta}</div>
            </div>
          </div>
        ))}
      </section>
      <section className="panel">
        <div className="border-b border-[var(--line)] px-4 py-3">
          <h2 className="section-label text-[var(--text)]">Home exceptions</h2>
        </div>
        {data.family.map((item) => (
          <div key={item.id} className="flex justify-between border-b border-[var(--line)] px-4 py-3">
            <div className="text-xs">
              {item.title}
              <div className="mt-1 text-[9px] text-[var(--faint)]">{item.detail}</div>
            </div>
            <span
              className={`mono text-[9px] ${item.state === "attention" ? "text-[var(--amber)]" : "text-[var(--green)]"}`}
            >
              {item.state.toUpperCase()}
            </span>
          </div>
        ))}
      </section>
    </div>
  );
}

function System({ data }: { data: Payload }) {
  return (
    <section className="panel">
      {data.integrations.map((item) => (
        <details key={item.key} className="border-b border-[var(--line)] p-4">
          <summary className="cursor-pointer text-sm">
            {item.name}
            <span
              className={`ml-3 text-xs ${item.health.stale || item.health.state !== "healthy" ? "text-[var(--amber)]" : "text-[var(--green)]"}`}
            >
              {item.health.stale ? "Out of date" : item.health.state}
            </span>
          </summary>
          <div className="mt-3 text-xs text-[var(--muted)]">
            <p>{item.health.message}</p>
            <p>
              {item.key} · {item.mode}
            </p>
            {item.health.ageSeconds !== undefined && (
              <p>Last updated {Math.floor(item.health.ageSeconds / 60)} minutes ago</p>
            )}
            {item.health.nextRefreshAt && <p>Next check: {new Date(item.health.nextRefreshAt).toLocaleTimeString()}</p>}
          </div>
        </details>
      ))}
    </section>
  );
}
