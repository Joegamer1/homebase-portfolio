import {
  homeResponseSchema,
  homeSystemResponseSchema,
  serviceResponseSchema,
  proxmoxResponseSchema,
  securityResponseSchema,
  careerImportResponseSchema,
  type CareerImport,
  careerResponseSchema,
  jobStatusResponseSchema,
  type CareerResponse,
  type JobStatus,
  type HomeResponse,
  type ProxmoxResponse,
  type SecurityResponse,
  gamesResponseSchema,
  familyResponseSchema,
  type GamesResponse,
  type FamilyResponse,
} from "@homebase/api-contracts";

const apiBaseUrl = process.env.NEXT_PUBLIC_HOMEBASE_API_URL ?? "http://localhost:4000";

export async function fetchHome(signal?: AbortSignal): Promise<HomeResponse> {
  const response = await fetch(`${apiBaseUrl}/api/v1/home`, { cache: "no-store", signal });
  if (!response.ok) throw new Error(`HOMEBASE API returned ${response.status}`);
  return homeResponseSchema.parse(await response.json());
}

export async function fetchProxmox(signal?: AbortSignal): Promise<ProxmoxResponse> {
  const response = await fetch(`${apiBaseUrl}/api/v1/proxmox`, { cache: "no-store", signal });
  if (!response.ok) throw new Error(`HOMEBASE API returned ${response.status}`);
  return proxmoxResponseSchema.parse(await response.json());
}

export async function fetchServices(source: "docker" | "uptime-kuma", signal?: AbortSignal) {
  const response = await fetch(`${apiBaseUrl}/api/v1/${source}`, { cache: "no-store", signal });
  if (!response.ok) throw new Error(`HOMEBASE API returned ${response.status}`);
  return serviceResponseSchema.parse(await response.json());
}

export async function fetchHomeSystem(
  source: "pihole" | "plex" | "home-assistant" | "tailscale",
  signal?: AbortSignal,
) {
  const response = await fetch(`${apiBaseUrl}/api/v1/${source}`, { cache: "no-store", signal });
  if (!response.ok) throw new Error(`HOMEBASE API returned ${response.status}`);
  return homeSystemResponseSchema.parse(await response.json());
}

export async function fetchSecurity(signal?: AbortSignal): Promise<SecurityResponse> {
  const response = await fetch(`${apiBaseUrl}/api/v1/security`, { cache: "no-store", signal });
  if (!response.ok) throw new Error(`HOMEBASE API returned ${response.status}`);
  return securityResponseSchema.parse(await response.json());
}

export async function fetchCareer(signal?: AbortSignal): Promise<CareerResponse> {
  const response = await fetch(`${apiBaseUrl}/api/v1/career`, { cache: "no-store", signal });
  if (!response.ok) throw new Error(`HOMEBASE API returned ${response.status}`);
  return careerResponseSchema.parse(await response.json());
}
export async function fetchGames(signal?: AbortSignal): Promise<GamesResponse> {
  const response = await fetch(`${apiBaseUrl}/api/v1/games`, { cache: "no-store", signal });
  if (!response.ok) throw new Error(`HOMEBASE API returned ${response.status}`);
  return gamesResponseSchema.parse(await response.json());
}
export async function updateGameUpdate(
  id: string,
  input: { saved?: boolean; read?: boolean; dismissed?: boolean; note?: string },
) {
  const response = await fetch(`${apiBaseUrl}/api/v1/games/updates/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(`HOMEBASE API returned ${response.status}`);
  return response.json();
}
export async function fetchFamily(signal?: AbortSignal): Promise<FamilyResponse> {
  const response = await fetch(`${apiBaseUrl}/api/v1/family`, { cache: "no-store", signal });
  if (!response.ok) throw new Error(`HOMEBASE API returned ${response.status}`);
  return familyResponseSchema.parse(await response.json());
}
export async function saveFamilyReminder(input: { id?: string; title?: string; dueAt?: string; completed?: boolean }) {
  const response = await fetch(
    `${apiBaseUrl}/api/v1/family/reminders${input.id ? `/${encodeURIComponent(input.id)}` : ""}`,
    {
      method: input.id ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  if (!response.ok) throw new Error(`HOMEBASE API returned ${response.status}`);
  return response.json();
}

export async function updateJobStatus(id: string, status: JobStatus) {
  const response = await fetch(`${apiBaseUrl}/api/v1/career/jobs/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!response.ok) throw new Error(`HOMEBASE API returned ${response.status}`);
  return jobStatusResponseSchema.parse(await response.json());
}

export async function importCareerJob(input: CareerImport) {
  const response = await fetch(`${apiBaseUrl}/api/v1/career/jobs/import`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok)
    throw new Error(
      "Could not import listing. Check the job URL, full description, and US remote location, then retry.",
    );
  return careerImportResponseSchema.parse(await response.json());
}
