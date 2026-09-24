"use client";

import { useEffect, useMemo, useState } from "react";
import type { CareerResponse, JobStatus } from "@homebase/api-contracts";
import { PageHeading } from "@/components/ui/page-heading";
import { fetchCareer, importCareerJob, updateJobStatus } from "@/lib/api-client";

import { careerApplicationLink, careerSearchLinks } from "@/lib/career-links";

type Job = NonNullable<CareerResponse["data"]["snapshot"]>["jobs"][number];
type View = "all" | "strongest" | "possible" | "saved" | "applied" | "dismissed" | "removed";

const views: Array<{ key: View; label: string }> = [
  { key: "all", label: "All matches" },
  { key: "strongest", label: "Strongest" },
  { key: "possible", label: "Possible" },
  { key: "saved", label: "Saved" },
  { key: "applied", label: "Applied" },
  { key: "dismissed", label: "Dismissed" },
  { key: "removed", label: "Removed" },
];

const money = (job: Job) => {
  if (!job.salaryMin && !job.salaryMax) return "Salary not listed";
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: job.salaryCurrency ?? "USD",
    maximumFractionDigits: 0,
  });
  const amount =
    job.salaryMin && job.salaryMax
      ? `${formatter.format(job.salaryMin)}–${formatter.format(job.salaryMax)}`
      : formatter.format(job.salaryMin ?? job.salaryMax ?? 0);
  return job.salaryEstimated ? `${amount} estimated` : amount;
};

function Score({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="min-w-24 border-l border-[var(--line)] pl-4 first:border-0 first:pl-0">
      <div className="section-label">{label}</div>
      <div className={`mono mt-1 text-2xl ${accent}`}>{value}</div>
    </div>
  );
}

function JobCard({
  job,
  onStatus,
  busy,
}: {
  job: Job;
  onStatus: (job: Job, status: JobStatus) => void;
  busy: boolean;
}) {
  const application = careerApplicationLink(job);
  const applicationUrl = application?.href;
  const searches = careerSearchLinks(`${job.title} ${job.company}`);
  return (
    <article className="border-b border-[var(--line)] p-4 last:border-0">
      <div className="flex flex-col justify-between gap-4 lg:flex-row">
        <div className="min-w-0 flex-1">
          <div className="mono text-[9px] uppercase tracking-[0.12em] text-[var(--muted)]">
            {job.company} · {job.location} · {job.arrangement} · {job.employmentType ?? "Type not listed"}
          </div>
          {applicationUrl ? (
            <a
              className="mt-2 inline-block text-base font-semibold hover:text-[var(--violet)]"
              href={applicationUrl}
              target="_blank"
              rel="noreferrer"
            >
              {job.title} ↗
            </a>
          ) : (
            <h3 className="mt-2 text-base font-semibold">{job.title}</h3>
          )}
          <p className="mono mt-1 text-xs text-[var(--green)]">{money(job)}</p>
          <div className="mt-2 flex flex-wrap gap-2 mono text-[9px] uppercase">
            <span className="border border-[var(--line-bright)] px-2 py-1">{job.fitLevel ?? "Stretch Fit"}</span>
            {job.cloudTrack && <span className="border border-[var(--line-bright)] px-2 py-1">{job.cloudTrack}</span>}
          </div>
        </div>
        <div className="flex gap-4">
          <Score label="Match" value={job.matchScore} accent="text-[var(--cyan)]" />
          <Score label="Career value" value={job.careerValueScore} accent="text-[var(--violet)]" />
        </div>
      </div>

      {(job.stale || job.available === false) && (
        <p className="mt-2 text-xs text-[var(--amber)]">
          {job.available === false
            ? "Listing removed. Saved and applied history is preserved."
            : "Source unavailable; showing the last known posting."}
        </p>
      )}
      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-[var(--cyan)]">Fit details and skills</summary>{" "}
        {job.availabilityCheckedAt && (
          <p className="mt-2 text-xs text-[var(--muted)]">
            {job.availabilityReason} · checked {new Date(job.availabilityCheckedAt).toLocaleString()}
          </p>
        )}
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div>
            <div className="section-label">Why it fits</div>
            <ul className="mt-2 space-y-1 text-xs leading-5 text-[var(--text)]">
              {job.reasons.length ? (
                job.reasons.map((reason) => <li key={reason}>+ {reason}</li>)
              ) : (
                <li>No strong fit signal yet.</li>
              )}
            </ul>
          </div>
          <div>
            <div className="section-label">Gaps / checks</div>
            <ul className="mt-2 space-y-1 text-xs leading-5 text-[var(--muted)]">
              {job.gaps.length ? job.gaps.map((gap) => <li key={gap}>− {gap}</li>) : <li>No material gaps found.</li>}
            </ul>
          </div>
        </div>
        {[...job.requiredSkills, ...job.preferredSkills].length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {job.requiredSkills.map((skill) => (
              <span className="border border-[var(--line-bright)] px-2 py-1 mono text-[9px] uppercase" key={skill}>
                {skill}
              </span>
            ))}
            {job.preferredSkills.map((skill) => (
              <span
                className="border border-[var(--line)] px-2 py-1 mono text-[9px] uppercase text-[var(--muted)]"
                key={skill}
              >
                {skill} · preferred
              </span>
            ))}
          </div>
        )}
      </details>
      {application && !application.direct && (
        <p className="mt-3 text-xs text-[var(--amber)]">
          This source did not supply a direct listing URL. Search by this role and company to find the original.
        </p>
      )}
      {(job.source === "linkedin" || job.source === "indeed") && (
        <p className="mt-3 text-xs text-[var(--muted)]">
          Imported listing · availability is not automatically verified.
        </p>
      )}
      <details className="mt-4 text-xs leading-6">
        <summary className="cursor-pointer text-[var(--cyan)]">Read job description</summary>
        <p className="mt-2 whitespace-pre-wrap text-[var(--muted)]">{job.description}</p>
      </details>
      <div className="mt-4 flex flex-wrap gap-2">
        {applicationUrl && (
          <a
            className="border border-[var(--violet)] px-3 py-1.5 text-xs text-[var(--violet)]"
            href={applicationUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {job.available === false ? "View removed listing" : application?.label} ↗
          </a>
        )}
        {job.source !== "mock-career" && job.matchScore >= 75 && (
          <>
            <a
              className="border border-[var(--line)] px-3 py-1.5 text-xs"
              href={searches.linkedin}
              target="_blank"
              rel="noopener noreferrer"
            >
              Find on LinkedIn ↗
            </a>
            <a
              className="border border-[var(--line)] px-3 py-1.5 text-xs"
              href={searches.indeed}
              target="_blank"
              rel="noopener noreferrer"
            >
              Find on Indeed ↗
            </a>
          </>
        )}
        {(["saved", "applied", "dismissed"] as const).map((status) => (
          <button
            className={`border px-3 py-1.5 mono text-[9px] uppercase tracking-[0.1em] transition-colors hover:border-[var(--violet)] ${
              job.status === status
                ? "border-[var(--violet)] bg-[color-mix(in_srgb,var(--violet)_12%,transparent)] text-[var(--violet)]"
                : "border-[var(--line)] text-[var(--muted)]"
            }`}
            disabled={busy}
            key={status}
            onClick={() => onStatus(job, job.status === status ? "new" : status)}
            type="button"
          >
            {status === "applied" ? (job.status === "applied" ? "Undo applied" : "Mark applied") : status}
          </button>
        ))}
        <span className="ml-auto self-center mono text-[9px] uppercase text-[var(--faint)]">
          {job.source.replace("greenhouse:", "Greenhouse · ")} · seen {new Date(job.firstSeenAt).toLocaleDateString()}
        </span>
      </div>
    </article>
  );
}

export function CareerClient() {
  const [data, setData] = useState<CareerResponse["data"]>();
  const [error, setError] = useState<string>();
  const [view, setView] = useState<View>("all");
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("all");
  const [sort, setSort] = useState("match");
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<string>();
  const [pending, setPending] = useState<string>();

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      try {
        setData((await fetchCareer(controller.signal)).data);
        setError(undefined);
      } catch {
        if (!controller.signal.aborted) setError("Career Radar refresh failed. Displayed values may be stale.");
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(refresh, 300000);
      }
    };
    void refresh();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, []);

  const snapshot = data?.snapshot;
  const counts = useMemo(() => {
    const jobs = snapshot?.jobs ?? [];
    return {
      all: jobs.filter((job) => job.status === "new" && job.available !== false).length,
      strongest: jobs.filter(
        (job) => job.status === "new" && job.available !== false && job.matchScore >= 75 && job.careerValueScore >= 70,
      ).length,
      possible: jobs.filter(
        (job) => job.status === "new" && job.available !== false && (job.matchScore < 75 || job.careerValueScore < 70),
      ).length,
      saved: jobs.filter((job) => job.status === "saved").length,
      applied: jobs.filter((job) => job.status === "applied").length,
      dismissed: jobs.filter((job) => job.status === "dismissed").length,
      removed: jobs.filter((job) => job.available === false).length,
    };
  }, [snapshot]);
  const jobs = useMemo(
    () =>
      (snapshot?.jobs ?? [])
        .filter((job) => {
          if (source !== "all" && job.source.split(":")[0] !== source) return false;
          if (query && !`${job.title} ${job.company} ${job.description}`.toLowerCase().includes(query.toLowerCase()))
            return false;
          if (view === "all") return job.status === "new" && job.available !== false;
          if (view === "strongest")
            return (
              job.status === "new" && job.available !== false && job.matchScore >= 75 && job.careerValueScore >= 70
            );
          if (view === "possible")
            return (
              job.status === "new" && job.available !== false && (job.matchScore < 75 || job.careerValueScore < 70)
            );
          if (view === "removed") return job.available === false;
          return job.status === view;
        })
        .sort((a, b) =>
          sort === "newest"
            ? new Date(b.postedAt ?? b.firstSeenAt).getTime() - new Date(a.postedAt ?? a.firstSeenAt).getTime()
            : sort === "salary"
              ? (b.salaryMax ?? b.salaryMin ?? 0) - (a.salaryMax ?? a.salaryMin ?? 0)
              : b.matchScore - a.matchScore || b.careerValueScore - a.careerValueScore,
        ),
    [snapshot, view, source, query, sort],
  );

  const submitImport = async (form: HTMLFormElement) => {
    setImporting(true);
    setImportMessage(undefined);
    const values = new FormData(form);
    try {
      const result = await importCareerJob({
        sourceUrl: String(values.get("sourceUrl")),
        title: String(values.get("title")),
        company: String(values.get("company")),
        location: String(values.get("location")),
        description: String(values.get("description")),
        arrangement: String(values.get("arrangement")) as "remote" | "hybrid" | "onsite",
      });
      setImportMessage(
        `Saved ${result.data.title}: ${result.data.matchScore}% match, ${result.data.careerValueScore}% career value.`,
      );
      setView(
        result.data.status === "new"
          ? result.data.matchScore >= 75 && result.data.careerValueScore >= 70
            ? "strongest"
            : "possible"
          : result.data.status,
      );
      setQuery("");
      setSource("all");
      form.reset();
      try {
        setData((await fetchCareer()).data);
      } catch {
        setError("Listing saved, but results could not refresh. Reload to see it.");
      }
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : "Could not import listing.");
    } finally {
      setImporting(false);
    }
  };

  const changeStatus = async (job: Job, status: JobStatus) => {
    setPending(job.id);
    const previous = job.status;
    setData((current) =>
      current?.snapshot
        ? {
            ...current,
            snapshot: {
              ...current.snapshot,
              jobs: current.snapshot.jobs.map((item) => (item.id === job.id ? { ...item, status } : item)),
            },
          }
        : current,
    );
    try {
      await updateJobStatus(job.id, status);
      setError(undefined);
    } catch {
      setData((current) =>
        current?.snapshot
          ? {
              ...current,
              snapshot: {
                ...current.snapshot,
                jobs: current.snapshot.jobs.map((item) => (item.id === job.id ? { ...item, status: previous } : item)),
              },
            }
          : current,
      );
      setError("That job status could not be saved.");
    } finally {
      setPending(undefined);
    }
  };

  return (
    <div>
      <PageHeading
        eyebrow="Workspace / Career"
        title="Career Radar"
        description="Cybersecurity and cloud roles in Ohio and remote across the United States."
      />
      <details className="panel mb-4 p-4">
        <summary className="cursor-pointer text-sm">Find or import a job</summary>

        <p className="mt-2 text-xs text-[var(--muted)]">
          {snapshot?.providers.some((provider) => provider.source === "jsearch" && provider.state !== "disabled")
            ? "Broader searches run daily across indexed job sites, alongside employer feeds. The free plan rotates through five target roles per day. Results include Ohio and US remote jobs scored against your profile."
            : "Employer feeds are active. Broader job search needs a free OpenWeb Ninja JSearch account connected on the server. Once connected, it searches your target roles daily across indexed job sites."}
        </p>
        <div className="mt-3 flex flex-wrap gap-3 text-sm text-[var(--cyan)]">
          <a
            href={careerSearchLinks(query || "security analyst detection engineer").linkedin}
            target="_blank"
            rel="noopener noreferrer"
          >
            Search LinkedIn ↗
          </a>
          <a href={careerSearchLinks(query || "security analyst").indeed} target="_blank" rel="noopener noreferrer">
            Search Indeed ↗
          </a>
        </div>
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer text-[var(--violet)]">Import a LinkedIn or Indeed listing</summary>
          <form
            className="mt-3 grid gap-3 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              void submitImport(event.currentTarget);
            }}
          >
            {[
              ["sourceUrl", "Job listing URL", "url", 2048],
              ["title", "Job title", "text", 200],
              ["company", "Company", "text", 200],
              ["location", "Ohio or US remote location from posting", "text", 300],
            ].map(([name, label, type, max]) => (
              <label className="grid gap-1 text-xs" key={name}>
                <span>{label}</span>
                <input
                  className="border border-[var(--line)] bg-[var(--panel)] p-2"
                  name={String(name)}
                  type={String(type)}
                  maxLength={Number(max)}
                  required
                />
              </label>
            ))}
            <label className="grid gap-1 text-xs sm:col-span-2">
              Full job description
              <textarea
                name="description"
                required
                minLength={80}
                maxLength={40000}
                rows={5}
                className="border border-[var(--line)] bg-[var(--panel)] p-2"
              />
            </label>
            <label className="grid gap-1 text-xs">
              Work arrangement
              <select name="arrangement" className="border border-[var(--line)] bg-[var(--panel)] p-2">
                <option value="remote">US remote</option>
                <option value="hybrid">Ohio hybrid</option>
                <option value="onsite">Ohio onsite</option>
              </select>
            </label>
            <label className="text-xs sm:col-span-2">
              <input type="checkbox" required /> The posting is in Ohio or explicitly allows remote work in the United
              States.
            </label>
            <button
              className="w-fit border border-[var(--violet)] px-3 py-2 text-xs text-[var(--violet)]"
              disabled={importing}
              type="submit"
            >
              {importing ? "Scoring…" : "Score and save listing"}
            </button>
          </form>
        </details>
        {importMessage && (
          <p role="status" className="mt-3 text-sm">
            {importMessage}
          </p>
        )}
      </details>
      {error && <p className="mb-4 text-sm text-[var(--amber)]">{error}</p>}
      {!data && !error && <p className="text-sm text-[var(--muted)]">Scanning career sources…</p>}
      {data?.health.stale && (
        <p role="status" className="mb-3 text-xs text-[var(--amber)]">
          Listings may be out of date.
        </p>
      )}
      {data && (
        <>
          <details className="panel mb-4 p-4">
            <summary className="cursor-pointer text-sm">Search preferences and sources</summary>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="mono text-[9px] uppercase text-[var(--muted)]">
                  {data.health.state} · {data.health.stale || error ? "stale / last known" : "fresh"} · last success{" "}
                  {data.health.lastSuccessAt ? new Date(data.health.lastSuccessAt).toLocaleString() : "—"}
                </div>
                {snapshot && (
                  <p className="mt-2 text-sm">
                    Targeting cybersecurity and cloud roles in Ohio and remote across the US. Dayton, Cincinnati,
                    Columbus, and nearby areas appear first.
                  </p>
                )}
              </div>
              {snapshot && (
                <div className="grid grid-cols-3 gap-px border border-[var(--line)] bg-[var(--line)]">
                  {[
                    ["Current", snapshot.profile.currentSalary],
                    ["Minimum", snapshot.profile.minimumSalary],
                    ["Preferred", snapshot.profile.preferredSalary],
                  ].map(([label, value]) => (
                    <div className="bg-[var(--panel)] px-3 py-2" key={label}>
                      <div className="section-label">{label}</div>
                      <div className="mono mt-1 text-xs">${Number(value).toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {snapshot && (
              <div className="mt-3 flex flex-wrap gap-2 mono text-[9px] uppercase text-[var(--muted)]">
                {snapshot.providers.map((provider) => (
                  <span
                    className="border border-[var(--line)] px-2 py-1"
                    key={provider.source}
                    title={provider.message}
                  >
                    {provider.source.replace("greenhouse:", "Greenhouse · ")} · {provider.state} · {provider.itemCount}{" "}
                    collected{provider.eligibleCount !== undefined ? ` · ${provider.eligibleCount} eligible` : ""}
                    {provider.message ? ` · ${provider.message}` : ""}
                  </span>
                ))}
              </div>
            )}
          </details>

          {snapshot && (
            <div className="mb-4 flex flex-wrap gap-3">
              <label className="grid gap-1 text-xs">
                Search roles
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Title, company, or skill"
                  className="border border-[var(--line)] bg-[var(--panel)] p-2"
                />
              </label>
              <label className="grid gap-1 text-xs">
                Source
                <select
                  value={source}
                  onChange={(event) => setSource(event.target.value)}
                  className="border border-[var(--line)] bg-[var(--panel)] p-2"
                >
                  <option value="all">All sources</option>
                  {[...new Set(snapshot.jobs.map((job) => job.source.split(":")[0]))].sort().map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs">
                Sort
                <select
                  value={sort}
                  onChange={(event) => setSort(event.target.value)}
                  className="border border-[var(--line)] bg-[var(--panel)] p-2"
                >
                  <option value="match">Highest match</option>
                  <option value="newest">Newest</option>
                  <option value="salary">Highest salary</option>
                </select>
              </label>
              <span className="self-end p-2 text-xs text-[var(--muted)]">
                {jobs.length} shown · tab counts include all sources
              </span>
            </div>
          )}
          {snapshot && (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
              <section className="panel overflow-hidden">
                <div className="flex overflow-x-auto border-b border-[var(--line)]">
                  {views.map((item) => (
                    <button
                      className={`shrink-0 border-r border-[var(--line)] px-4 py-3 mono text-[9px] uppercase tracking-[0.12em] ${view === item.key ? "bg-[var(--panel-raised)] text-[var(--violet)]" : "text-[var(--muted)] hover:text-[var(--text)]"}`}
                      key={item.key}
                      onClick={() => setView(item.key)}
                      type="button"
                    >
                      {item.label} · {counts[item.key]}
                    </button>
                  ))}
                </div>
                {jobs.length === 0 ? (
                  <p className="p-6 text-sm text-[var(--muted)]">
                    No matching roles in this view. Ohio and explicitly US remote postings are included.
                  </p>
                ) : (
                  jobs.map((job) => (
                    <div className={pending === job.id ? "opacity-60" : ""} key={job.id}>
                      <JobCard job={job} onStatus={changeStatus} busy={Boolean(pending)} />
                    </div>
                  ))
                )}
              </section>

              <aside className="panel h-fit overflow-hidden">
                <div className="border-b border-[var(--line)] px-4 py-3">
                  <h2 className="section-label text-[var(--text)]">Skills this week</h2>
                </div>
                {snapshot.skillTrends.length === 0 ? (
                  <p className="p-4 text-xs text-[var(--muted)]">Skill history will appear as roles accumulate.</p>
                ) : (
                  snapshot.skillTrends.map((trend) => (
                    <div
                      className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3 text-xs last:border-0"
                      key={trend.skill}
                    >
                      <span>{trend.skill}</span>
                      <span className={`mono ${trend.delta > 0 ? "text-[var(--green)]" : "text-[var(--muted)]"}`}>
                        {trend.currentWeek} · {trend.delta >= 0 ? "+" : ""}
                        {trend.delta}
                      </span>
                    </div>
                  ))
                )}
              </aside>
            </div>
          )}
        </>
      )}
    </div>
  );
}
