# Homebase

Homebase is a self-hosted personal operations dashboard. It brings home infrastructure, security advisories, career opportunities, games, and household calendars into one interface organized around a simple question: **what needs attention today?**

This repository is a sanitized project snapshot. The application was designed for a private deployment; it is shared here to show the product design, architecture, implementation, and AI-assisted development process. Sample profile values and local addresses are illustrative. No production credentials, private network addresses, household records, or deployment backups are included.

## Product highlights

- **Attention engine:** deterministic ranking with visible reasons and stable identifiers, so an urgent infrastructure issue can surface alongside other domains without hiding its source.
- **Operational workspaces:** Proxmox, Docker, Uptime Kuma, Pi-hole, Plex, Home Assistant, and Tailscale collectors normalize provider data into versioned API contracts. Failed collections preserve the last successful snapshot and mark it stale.
- **Security intelligence:** CISA KEV and NVD data are matched against an inventory with explicit uncertainty when a version cannot be verified.
- **Career Radar:** job board and optional search feeds are deduplicated and scored for skill match and career value. Provider requests, scoring, and persistence stay server-side.
- **Games and Family:** game update feeds and household calendars are presented as actionable summaries with source and freshness context.
- **Responsive clients:** a Next.js web/PWA consumes the API; a Swift native client prototype connects to a configured server.

The interface prioritizes clear status, source provenance, loading and stale states, and actions that help the owner decide what to do next. See [DESIGN.md](DESIGN.md), [ARCHITECTURE.md](ARCHITECTURE.md), and [AI_WORKFLOW.md](AI_WORKFLOW.md) for the design and build approach.

## Architecture

```text
apps/web, apps/native
        │
        ▼
services/api  ──► packages/api-contracts
        │
        ├──► packages/attention-engine
        ├──► packages/career-engine
        ├──► packages/collectors ──► external read-only sources
        └──► PostgreSQL / Prisma
```

The web client uses `/api/v1` and does not access collectors or persistence directly. Server configuration is validated at startup. The collection worker refreshes integrations independently, while API responses expose health, freshness, and stale fallback. Provider credentials belong only in the local server environment.

## Run locally

Requires Docker Engine with Compose v2. From the repository root:

```bash
cp .env.example .env
docker compose up --build
```

Open the web app at `http://localhost:3000` and API health at `http://localhost:4000/api/v1/health`. The included `.env.example` has placeholder settings. Configure only the integrations you want to use; external services require your own credentials and endpoints. This project has no authentication layer for broad public deployment, so keep a running instance on a trusted network.

For local development with Node.js 22+ and pnpm:

```bash
pnpm install
pnpm dev
```

## Verify

```bash
pnpm check
docker compose config
```

`pnpm check` covers formatting, linting, type checks, unit and contract tests, architecture boundaries, and production builds. The boundary check prevents the web client from importing server collectors, Prisma, or known provider credential names.

## Repository map

| Path                            | Purpose                                       |
| ------------------------------- | --------------------------------------------- |
| `apps/web`                      | Responsive web interface and PWA              |
| `apps/native`                   | Swift client prototype                        |
| `services/api`                  | Versioned API and collection worker           |
| `packages/api-contracts`        | Shared Zod response contracts                 |
| `packages/attention-engine`     | Priority rules and explanations               |
| `packages/career-engine`        | Job fit and advancement scoring               |
| `packages/collectors`           | Provider adapters and normalization           |
| `packages/config`               | Validated server configuration                |
| `prisma`                        | Schema, migrations, and sample seed           |
| `infrastructure/docker-monitor` | Restricted read-only Docker telemetry adapter |

## Scope

Homebase is a personal project and design case study, not a hosted service or supported package. The published configuration is intentionally generic. The original private deployment and its data are outside this repository.
