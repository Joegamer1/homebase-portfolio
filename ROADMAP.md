# ROADMAP

## Milestone 0 — Foundation

Goal: Create a working, attractive HOMEBASE shell with mock data.

Deliverables:

- TypeScript monorepo running on Node.js
- Next.js/React responsive, installable web/PWA (Client #1)
- separate HOMEBASE API service with `/api/v1`
- PostgreSQL + Prisma
- Docker Compose
- App shell
- Navigation
- Home page
- Attention queue
- Lab shell
- System shell
- Mock collectors
- normalized domain models and API contracts
- attention engine wired through the API
- Design tokens
- reserved `apps/ios` and `apps/macos` locations without native implementation

Exit criteria:

- one-command startup
- no credentials required
- mock data demonstrates full product direction
- browser uses the HOMEBASE API and makes no provider or database calls
- mock data travels through collectors -> normalized models -> attention engine -> API -> web/PWA
- API and web are independently testable
- no native Apple app code is implemented

---

## Milestone 1 — Proxmox

Add the first real integration.

Features:

- node status
- CPU
- memory
- uptime
- storage
- VM state
- LXC state
- recent failed tasks
- integration health

Use a dedicated least-privilege Proxmox API token.

Exit criteria:

- mock and real Proxmox collectors share the same normalized interface
- Proxmox failure does not break HOMEBASE
- stale state is obvious

---

## Milestone 2 — Docker + Service Health

Features:

- Docker container state
- health status
- uptime
- restart count
- image
- optional CPU/RAM
- Uptime Kuma integration

Prefer a restricted Docker socket proxy or purpose-built API instead of blindly mounting `/var/run/docker.sock`.

---

## Milestone 3 — Core Home Services

Integrate:

- Pi-hole
- Plex
- Home Assistant
- Tailscale where practical

Create domain-specific health summaries.

---

## Milestone 4 — Security Intelligence

Status: first authoritative pipeline live on HOMEBASE (2026-09-09).

Features:

- CISA KEV ingestion
- CVE/advisory ingestion
- technology inventory
- relevance matching
- deduplication
- severity ranking
- affected-lab explanation

Do not build social feeds first.

Start with authoritative structured sources.

Add curated researcher feeds only after the signal pipeline works.

---

## Milestone 5 — Career Radar

Status: first provider pipeline live on HOMEBASE (2026-09-09).

Features:

- career profile
- job source adapters
- normalized job model
- match score
- career-value score
- skill extraction
- save / dismiss / applied state
- weekly skill trend

Key question:

> Would this role move the owner forward?

---

## Milestone 6 — Games

Features:

- tracked games
- tracked champions/heroes
- official patch notes
- change relevance
- useful guides / feeds
- optional performance data

---

## Milestone 7 — Family

Features:

- calendar
- work schedules
- appointments
- reminders
- household alerts
- maintenance

Keep this supportive, simple, and private.

---

## Milestone 8 — Attention Engine v2

Improve scoring using:

- urgency
- relevance
- consequence
- recency
- confidence
- goals

Add:

- daily briefing
- "what changed?"
- "what needs attention?"
- dedupe
- snooze
- acknowledge
- resolved state

---

## Milestone 9 — Optional Natural Language

Add a local or hosted LLM layer only after deterministic data flows are trustworthy.

Useful queries:

- What needs my attention?
- What changed in the lab today?
- Is there anything I should patch tonight?
- What are the strongest new jobs?
- What changed for the champions I play?
- What does tomorrow look like?

The LLM should summarize trusted internal data, not invent operational state.
