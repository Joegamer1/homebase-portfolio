export interface EmployerTarget {
  source: string;
  externalId: string;
  board: string;
  kind: "greenhouse" | "lever" | "ashby";
}

/** Only known public ATS hosts can trigger additional inventory requests. */
export function employerTarget(value: string | null): EmployerTarget | undefined {
  if (!value) return;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return;
  const parts = url.pathname.split("/").filter(Boolean);
  const board = parts[0];
  if (!board || !/^[a-zA-Z0-9_-]{1,100}$/.test(board)) return;
  if (
    ["boards.greenhouse.io", "job-boards.greenhouse.io"].includes(url.hostname) &&
    parts[1] === "jobs" &&
    /^\d+$/.test(parts[2] ?? "")
  )
    return { source: `greenhouse:${board}`, board, kind: "greenhouse", externalId: parts[2]! };
  if (url.hostname === "jobs.lever.co" && /^[a-zA-Z0-9-]+$/.test(parts[1] ?? ""))
    return { source: `lever:${board}`, board, kind: "lever", externalId: parts[1]! };
  if (url.hostname === "jobs.ashbyhq.com" && /^[a-zA-Z0-9-]+$/.test(parts[1] ?? ""))
    return { source: `ashby:${board}`, board, kind: "ashby", externalId: parts[1]! };
}

export function supportedListingPage(value: string | null): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      ((["www.linkedin.com", "linkedin.com"].includes(url.hostname) && /^\/jobs\/view\/[^/]+\/?$/.test(url.pathname)) ||
        (["www.indeed.com", "indeed.com"].includes(url.hostname) &&
          url.pathname === "/viewjob" &&
          Boolean(url.searchParams.get("jk"))) ||
        (url.hostname === "jobs.smartrecruiters.com" && /^\/[^/]+\/\d+/.test(url.pathname)))
    );
  } catch {
    return false;
  }
}
