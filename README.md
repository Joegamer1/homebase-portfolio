# Homebase

I built Homebase because I wanted one place to check my homelab, security advisories, job listings, game updates, and household calendars. It runs privately and helps me decide what needs attention without opening each service separately.

I designed the product and used AI to help implement and test it. This repository contains the application source with personal details removed and example configuration in place of my deployment settings. More on that process in [AI_WORKFLOW.md](AI_WORKFLOW.md).

## What's in it

- **Home:** a ranked attention list, today's events, and status across the other sections. Each item shows why it was ranked.
- **Lab:** status from Proxmox, Docker, Uptime Kuma, Pi-hole, Plex, Home Assistant, and Tailscale. When a collection fails, the last successful result stays visible with a stale label.
- **Security:** CISA KEV and NVD advisories matched against a software inventory. Possible version matches are marked for review.
- **Career Radar:** job listings from employer boards and an optional search provider, with separate scores for skills and career advancement. Listings can be saved, dismissed, or marked as applied.
- **Games:** updates for tracked games and characters, with links to the source.
- **Family:** household calendars collected through Home Assistant.

The main interface is a responsive Next.js web app/PWA. There is also a Swift client prototype in `apps/native`.

## How it works

```text
Web/PWA or native client
        |
        v
Node.js API (/api/v1)
        |
        +-- Shared Zod contracts
        +-- Attention and career scoring
        +-- Collectors for external services
        +-- PostgreSQL / Prisma
```

The browser calls the Homebase API. Collection, scoring, credentials, and database access stay on the server. A worker refreshes each integration independently. [ARCHITECTURE.md](ARCHITECTURE.md) covers the structure; [DESIGN.md](DESIGN.md) covers the interface decisions.

## Run locally

Requires Docker Engine and Compose v2:

```bash
cp .env.example .env
# Set a local database password in .env before starting.
docker compose up --build
```

Open `http://localhost:3000`. API health is at `http://localhost:4000/api/v1/health`.

The example file includes placeholder settings. Add your own endpoints and credentials for the integrations you want to use. Homebase was built for a trusted private network and does not include authentication for an internet-facing deployment.

For development, use Node.js 22+ and pnpm:

```bash
pnpm install
pnpm dev
```

## Checks

```bash
pnpm check
docker compose config
```

`pnpm check` runs formatting, linting, type checks, tests, architecture checks, and production builds. The architecture check catches browser imports of collectors, Prisma, and known provider credential names.

## Files

| Path                            | Contents                                  |
| ------------------------------- | ----------------------------------------- |
| `apps/web`                      | Web interface and PWA                     |
| `apps/native`                   | Swift client prototype                    |
| `services/api`                  | API and collection worker                 |
| `packages/api-contracts`        | Shared Zod contracts                      |
| `packages/attention-engine`     | Priority rules and explanations           |
| `packages/career-engine`        | Job scoring                               |
| `packages/collectors`           | Provider adapters                         |
| `packages/config`               | Server configuration validation           |
| `prisma`                        | Schema, migrations, and example seed data |
| `infrastructure/docker-monitor` | Read-only Docker telemetry adapter        |

This is a personal project. I published it so people can look through the design and code; I don't maintain it as a service for others. Credentials, household records, deployment backups, and the original private Git history are excluded. Profile values and addresses in this copy are examples.
