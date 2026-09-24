# Scheduled collection worker

Docker Compose now starts one dedicated worker using the same image, database,
and server-side provider configuration as the API. The entry point is
`services/api/src/worker.ts`, reusing application collection/persistence functions.
The worker has no listening ports and is independent of browser requests.

- Proxmox: every 60 seconds after completion.
- Docker and Kuma: `SERVICE_REFRESH_SECONDS` after completion.
- Home systems: `HOME_SYSTEM_REFRESH_SECONDS` after completion.
- Security: `SECURITY_REFRESH_SECONDS` after completion.
- Career: `CAREER_REFRESH_SECONDS` after completion.
- Career removal audit: on worker startup and every 24 hours after completion.
  It checks full configured employer inventories before ranking or eligibility
  limits, persists results under `career-availability`, and preserves job statuses.
  Failed sources and restricted pages are unverified. LinkedIn/Indeed imports
  are marked removed only on HTTP 404/410; HTTP 200 alone cannot establish that
  applications are still open. Removed jobs leave active views but remain in
  Removed and their saved/applied views. The UI shows the last check time.
- Completed collector runs older than `COLLECTOR_RUN_RETENTION_DAYS` (30 by default)
  are removed daily. Snapshots, applications, and advisories are retained.

Each integration has a separate loop. A slow or failed feed does not block other
integrations, and a job never overlaps itself. On shutdown, no new jobs launch;
in-flight jobs drain until the container grace period expires. An interrupted NVD
window never advances its checkpoint. Run exactly one worker replica; distributed
leadership and horizontal worker scaling are not implemented.

Compose fixes `COLLECTION_MODE=worker` for both API and worker. In this mode, API
GETs read persisted snapshots without contacting providers. Missing snapshots show
“Waiting for the first successful worker collection.” Snapshots older than twice
their collection interval show overdue/stale. Per-feed completeness and last-success
times remain visible even when another feed succeeds.

Local development keeps demand collection by default. To exercise the worker,
export `COLLECTION_MODE=worker` in the API shell and run `pnpm worker` in another
shell with the same `DATABASE_URL` and provider environment. Do not run a worker
alongside an API using demand mode against the same database.

## Deployment

On the existing Homebase server, after syncing the tested source and retaining its
protected `.env`:

```sh
docker compose config --quiet
docker compose up -d --build
docker compose ps
docker compose logs --tail=50 worker
```

No new database migration is required: feed checkpoints and per-source fallback
records use distinct keys in `IntegrationSnapshot`. The initial NVD run scans the
configured lookback window with all pages; later runs overlap the last successful
checkpoint by five minutes and merge changes. Page requests are paced at 6.5 seconds;
HTTP rate-limit/server failures have bounded retries honoring Retry-After. Windows
with inconsistent pagination or exceeding the 200-page safety budget are incomplete
and preserve the last complete snapshot. Increasing the lookback window forces a
full rescan. A healthy source never overwrites the other source's checkpoint.

Validate `/api/v1/home`, `/api/v1/security`, `/api/v1/career`, and `/system` after
initial collection. A controlled provider outage should retain last-known records
with explicit stale/incomplete labels; restore connectivity and verify recovery.
For a worker outage, saved snapshots remain readable and age into overdue state.
Do not submit a real job application merely to test status tracking.
