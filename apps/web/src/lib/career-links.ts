type Listing = { source: string; sourceUrl?: string; title: string; company: string };

export function careerSearchLinks(keywords: string) {
  return {
    linkedin: `https://www.linkedin.com/jobs/search/?${new URLSearchParams({ keywords, location: "United States", f_WT: "2" })}`,
    indeed: `https://www.indeed.com/jobs?${new URLSearchParams({ q: keywords, l: "Remote" })}`,
  };
}

export function careerApplicationLink(job: Listing) {
  if (job.source === "mock-career") return undefined;
  try {
    const url = new URL(job.sourceUrl ?? "");
    if (url.protocol === "https:" && !url.username && !url.password) {
      const label =
        url.hostname.endsWith(".linkedin.com") || url.hostname === "linkedin.com"
          ? "Apply on LinkedIn"
          : url.hostname.endsWith(".indeed.com") || url.hostname === "indeed.com"
            ? "Apply on Indeed"
            : "Open application";
      return { href: url.href, label, direct: true };
    }
  } catch {
    /* Older snapshots may not have a URL. */
  }
  return {
    href: careerSearchLinks(`${job.title} ${job.company}`).linkedin,
    label: "Find listing on LinkedIn",
    direct: false,
  };
}
