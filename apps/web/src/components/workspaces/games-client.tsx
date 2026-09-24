"use client";
import { useEffect, useMemo, useState } from "react";
import { PageHeading } from "@/components/ui/page-heading";
import { ErrorState, LoadingState } from "@/components/ui/data-state";
import { fetchGames, updateGameUpdate } from "@/lib/api-client";
import type { GamesResponse } from "@homebase/api-contracts";
type Update = NonNullable<GamesResponse["data"]["snapshot"]>["updates"][number];
type Mutation = (item: Update, input: Parameters<typeof updateGameUpdate>[1]) => Promise<void>;

const shortDate = (value: string) =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(value));

const longDate = (value: string) =>
  new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(new Date(value));

export function GamesClient() {
  const [data, setData] = useState<GamesResponse["data"]>();
  const [view, setView] = useState("for-me");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [mutationError, setMutationError] = useState("");
  const [selectedLeaguePatch, setSelectedLeaguePatch] = useState("");
  useEffect(() => {
    void fetchGames()
      .then((r) => setData(r.data))
      .catch(() => setError("Game sources are unavailable; check the source configuration."));
  }, []);
  const snapshot = data?.snapshot;
  const rows = useMemo(() => {
    let items = snapshot?.updates ?? [];
    if (view === "for-me") items = items.filter((x) => x.relevanceTier < 5 && !x.read);
    if (view === "saved") items = items.filter((x) => x.saved);
    if (view === "history") items = items.filter((x) => x.read || x.dismissed);
    if (view === "league") items = items.filter((x) => x.game === "league-of-legends");
    if (view === "deadlock") items = items.filter((x) => x.game === "deadlock");
    if (query)
      items = items.filter((x) => `${x.title} ${x.entity} ${x.patch}`.toLowerCase().includes(query.toLowerCase()));
    return items.filter((x) => !x.dismissed || view === "history");
  }, [snapshot, view, query]);
  const leaguePatches = useMemo(() => {
    const groups = new Map<string, { patch: string; publishedAt: string; updates: Update[] }>();
    for (const update of snapshot?.updates.filter((item) => item.game === "league-of-legends") ?? []) {
      const group = groups.get(update.patch) ?? {
        patch: update.patch,
        publishedAt: update.publishedAt,
        updates: [],
      };
      group.updates.push(update);
      if (update.publishedAt > group.publishedAt) group.publishedAt = update.publishedAt;
      groups.set(update.patch, group);
    }
    return [...groups.values()].sort(
      (a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || b.patch.localeCompare(a.patch),
    );
  }, [snapshot]);
  const activeLeaguePatch = leaguePatches.some((item) => item.patch === selectedLeaguePatch)
    ? selectedLeaguePatch
    : leaguePatches[0]?.patch;
  const displayedRows =
    view === "league" && activeLeaguePatch ? rows.filter((item) => item.patch === activeLeaguePatch) : rows;
  if (!data && !error) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  const mutate: Mutation = async (item, input) => {
    const old = item;
    setData(
      (current) =>
        current && {
          ...current,
          snapshot: current.snapshot && {
            ...current.snapshot,
            updates: current.snapshot.updates.map((x) => (x.id === item.id ? { ...x, ...input } : x)),
          },
        },
    );
    try {
      await updateGameUpdate(item.id, input);
    } catch {
      setMutationError("Could not save that change. Your previous state has been restored.");
      setData(
        (current) =>
          current && {
            ...current,
            snapshot: current.snapshot && {
              ...current.snapshot,
              updates: current.snapshot.updates.map((x) => (x.id === old.id ? old : x)),
            },
          },
      );
    }
  };
  return (
    <div>
      <PageHeading
        eyebrow="Workspace / 05"
        title="Game intelligence"
        description="Recent updates for your tracked games and characters."
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {["for-me", "league", "deadlock", "saved", "history"].map((v) => (
          <button
            type="button"
            key={v}
            onClick={() => setView(v)}
            className={`border px-3 py-2 mono text-[9px] uppercase ${view === v ? "border-[var(--violet)] text-[var(--violet)]" : "border-[var(--line)] text-[var(--muted)]"}`}
          >
            {v.replace("-", " ")}
          </button>
        ))}
        <input
          aria-label="Search game updates"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="search updates"
          className="min-w-48 border border-[var(--line)] bg-transparent px-3 py-2 text-xs"
        />
      </div>
      {mutationError && (
        <p role="alert" className="mb-4 text-sm text-[var(--amber)]">
          {mutationError}
        </p>
      )}
      <p className="mb-4 text-xs text-[var(--muted)]">
        {view === "league"
          ? `${displayedRows.length} changes in patch ${activeLeaguePatch ?? "—"}.`
          : `${displayedRows.length} updates.`}{" "}
      </p>
      {view === "league" && (
        <div aria-label="League patches" className="mb-4 flex gap-2 overflow-x-auto pb-1">
          {leaguePatches.map((item) => (
            <button
              type="button"
              key={item.patch}
              onClick={() => setSelectedLeaguePatch(item.patch)}
              aria-pressed={activeLeaguePatch === item.patch}
              className={`min-w-24 shrink-0 border px-3 py-2 text-left ${activeLeaguePatch === item.patch ? "border-[var(--cyan)] bg-[color-mix(in_srgb,var(--cyan)_8%,transparent)]" : "border-[var(--line)]"}`}
            >
              <span className="mono block text-[11px]">{item.patch}</span>
              <span className="mt-1 block text-[9px] text-[var(--muted)]">{shortDate(item.publishedAt)}</span>
            </button>
          ))}
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
        <section className="panel">
          {snapshot && !displayedRows.length && (
            <p className="p-4 text-sm">
              No collected changes match this view. Select League or History to browse other changes.
            </p>
          )}
          {!snapshot && (
            <p className="p-4 text-sm text-[var(--muted)]">
              No game sources configured. Configure official League and Deadlock URLs to begin collecting.
            </p>
          )}
          {snapshot && view === "league" && activeLeaguePatch && (
            <LeaguePatchFeed
              patch={activeLeaguePatch}
              publishedAt={leaguePatches.find((item) => item.patch === activeLeaguePatch)!.publishedAt}
              updates={displayedRows}
              mutate={mutate}
            />
          )}
          {snapshot &&
            view !== "league" &&
            displayedRows.map((item) => (
              <article key={item.id} className="border-b border-[var(--line)] p-4 last:border-0">
                <div className="mono text-[9px] uppercase text-[var(--muted)]">
                  {item.gameLabel} · patch {item.patch} · {item.category} · {item.classification}
                </div>
                <h2 className="mt-2 text-sm font-semibold">{item.title}</h2>
                <p className="mt-1 text-xs text-[var(--muted)]">{item.summary}</p>
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs text-[var(--cyan)]">Change details</summary>{" "}
                  <div className="mt-3 grid gap-2 text-xs md:grid-cols-2">
                    <div>
                      <div className="section-label">Confirmed change</div>
                      <p className="mt-1 whitespace-pre-wrap">{item.confirmedChange}</p>
                    </div>
                    {item.gameplayImplication && (
                      <div>
                        <div className="section-label">Possible gameplay implication</div>
                        <p className="mt-1 text-[var(--amber)]">{item.gameplayImplication}</p>
                      </div>
                    )}
                  </div>
                </details>{" "}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void mutate(item, { read: !item.read })}
                    className="border border-[var(--line)] px-2 py-1 mono text-[9px]"
                  >
                    {item.read ? "MARK UNREAD" : "MARK READ"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void mutate(item, { saved: !item.saved })}
                    className="border border-[var(--line)] px-2 py-1 mono text-[9px]"
                  >
                    {item.saved ? "UNSAVE" : "SAVE"}
                  </button>
                  {item.sourceUrl && (
                    <a
                      className="border border-[var(--cyan)] px-2 py-1 mono text-[9px] text-[var(--cyan)]"
                      href={item.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      OPEN SOURCE ↗
                    </a>
                  )}
                </div>
              </article>
            ))}
        </section>
        <aside className="space-y-4">
          <section className="panel p-4">
            <div className="section-label">Tracked roster</div>
            {snapshot?.profile.tracked.map((x) => (
              <div key={`${x.game}:${x.entityId}`} className="mt-2 text-xs">
                {x.name}
                <span className="ml-2 text-[var(--muted)]">{x.game}</span>
              </div>
            ))}
          </section>
          <section className="panel p-4">
            <div className="section-label">Before you queue</div>
            {(snapshot?.updates.filter((x) => x.relevanceTier === 1 && !x.read).slice(0, 5) ?? []).map((x) => (
              <div key={x.id} className="mt-2 text-xs">
                {x.entity}: {x.title}
              </div>
            ))}
          </section>
          <details className="panel p-4 text-xs text-[var(--muted)]">
            <summary className="cursor-pointer text-sm">Source details</summary>
            {snapshot?.providers.map((x) => (
              <div key={x.source} className="mb-2">
                <a href={x.source} target="_blank" rel="noreferrer" className="break-all underline">
                  {x.source}
                </a>{" "}
                · {x.state} · {x.itemCount} updates
                <p>{x.message}</p>
              </div>
            ))}
          </details>
          <section className="panel p-4 text-xs">
            <a
              href="https://www.reddit.com/r/summonerschool/"
              target="_blank"
              rel="noreferrer"
              className="text-[var(--cyan)]"
            >
              Summoner’s School ↗
            </a>
            <p className="mt-2 text-[var(--muted)]">
              Community education. Posts are not collected or used to confirm balance changes.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}

const groupCopy = {
  buff: { label: "Major buffs", color: "text-[var(--green)]" },
  nerf: { label: "Major nerfs", color: "text-[var(--red)]" },
  mixed: { label: "Mixed adjustments", color: "text-[var(--amber)]" },
  unclear: { label: "Other confirmed changes", color: "text-[var(--muted)]" },
} as const;

function LeaguePatchFeed({
  patch,
  publishedAt,
  updates,
  mutate,
}: {
  patch: string;
  publishedAt: string;
  updates: Update[];
  mutate: Mutation;
}) {
  const champions = updates.filter((item) => item.category !== "item");
  const items = updates.filter((item) => item.category === "item");
  return (
    <div>
      <header className="border-b border-[var(--line)] p-4">
        <div className="section-label">League patch</div>
        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="mono text-xl text-[var(--cyan)]">{patch}</h2>
          <time className="mono text-[10px] text-[var(--muted)]" dateTime={publishedAt}>
            Published {longDate(publishedAt)}
          </time>
        </div>
        <p className="mt-2 text-xs text-[var(--muted)]">
          {champions.length} champion changes · {items.length} item or system changes
        </p>
      </header>
      {(["buff", "nerf", "mixed", "unclear"] as const).map((classification) => {
        const section = champions.filter((item) => item.classification === classification);
        if (!section.length) return null;
        return (
          <section key={classification} className="border-b border-[var(--line)] last:border-0">
            <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-2">
              <h3 className={`section-label ${groupCopy[classification].color}`}>{groupCopy[classification].label}</h3>
              <span className="mono text-[9px] text-[var(--faint)]">{section.length}</span>
            </div>
            {section.map((item) => (
              <CompactChange key={item.id} item={item} mutate={mutate} />
            ))}
          </section>
        );
      })}
      {items.length > 0 && (
        <details className="p-4">
          <summary className="cursor-pointer text-xs text-[var(--cyan)]">Items and systems · {items.length}</summary>
          <div className="mt-3 border-t border-[var(--line)]">
            {items.map((item) => (
              <CompactChange key={item.id} item={item} mutate={mutate} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function CompactChange({ item, mutate }: { item: Update; mutate: Mutation }) {
  return (
    <details className="border-b border-[var(--line)] px-4 py-3 last:border-0">
      <summary className="cursor-pointer list-none">
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm font-medium">{item.title}</span>
          <span className="mono shrink-0 text-[9px] text-[var(--faint)]">REVIEW +</span>
        </div>
        <p className="mt-1 line-clamp-2 text-xs text-[var(--muted)]">{item.summary}</p>
      </summary>
      <div className="mt-3 border-l border-[var(--line-bright)] pl-3">
        <div className="section-label">Confirmed changes</div>
        <p className="mt-2 whitespace-pre-wrap text-xs leading-5">{item.confirmedChange}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void mutate(item, { read: !item.read })}
            className="border border-[var(--line)] px-2 py-1 mono text-[9px]"
          >
            {item.read ? "MARK UNREAD" : "MARK READ"}
          </button>
          <button
            type="button"
            onClick={() => void mutate(item, { saved: !item.saved })}
            className="border border-[var(--line)] px-2 py-1 mono text-[9px]"
          >
            {item.saved ? "UNSAVE" : "SAVE"}
          </button>
          {item.sourceUrl && (
            <a
              href={item.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="border border-[var(--cyan)] px-2 py-1 mono text-[9px] text-[var(--cyan)]"
            >
              OPEN RIOT NOTES ↗
            </a>
          )}
        </div>
      </div>
    </details>
  );
}
