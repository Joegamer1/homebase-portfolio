# Architecture

## Architectural rules

- Use TypeScript end-to-end for the first version, running on Node.js.
- Use React and Next.js for the responsive, installable web/PWA client.
- The web/PWA is an API client.
- Keep the backend/API deployable and testable separately from the UI.
- Expose client-facing capabilities through versioned HOMEBASE APIs beginning at `/api/v1`.
- No client may communicate directly with Proxmox, Docker, Home Assistant, Plex, CISA, job services, game services, or other providers.
- Provider credentials, collection, normalization, persistence, scoring, and integration health belong on the server.
- Native iPhone and Mac clients are future work, not Phase 0 scope.

## High-level flow

```text
External systems or mock providers
                |
                v
       Collectors / adapters
                |
                v
      Normalized domain models
                |
        +-------+--------+
        |                |
        v                v
    PostgreSQL     Integration health
        |
        v
   Attention engine
        |
        v
 Versioned HOMEBASE API (/api/v1)
        |
   +----+--------------------+
   |             |           |
   v             v           v
Web/PWA       iPhone       Mac
(Client #1)   (future)     (future)
```

## Repository layout

```text
apps/
  web/                 # Next.js/React PWA; API consumer only
  ios/                 # reserved for a future Swift/SwiftUI client
  macos/               # reserved for a future Swift/SwiftUI client
services/
  api/                 # Node.js/TypeScript HOMEBASE API
  worker/              # scheduled collection and scoring when separated
packages/
  domain/              # normalized models and invariants
  api-contracts/       # versioned request/response schemas
  attention-engine/    # deterministic ranking and explanations
  collectors/          # interfaces, mock providers, real adapters later
  config/
  observability/
prisma/
  schema.prisma
infrastructure/
  docker-compose.yml
docs/
```

`apps/ios` and `apps/macos` may be represented by tracked placeholder files during Phase 0. Do not scaffold or implement native applications yet.

## Recommended runtime roles

### Web process

- serves the Next.js UI and PWA assets
- handles browser presentation and interactions
- consumes only versioned HOMEBASE API contracts
- does not import collectors or access the database directly

### API process

- owns `/api/v1` routes
- validates requests and responses
- performs application queries and commands
- exposes client-safe data without provider credentials

### Worker process

- scheduled collection
- normalization
- scoring
- cleanup
- feed refresh

The services may live in one monorepo and share TypeScript packages, with separate UI and API dependencies. They must be independently testable and deployable.

## Why PostgreSQL

HOMEBASE will eventually keep:

- telemetry history
- job history
- advisories
- feed items
- state transitions
- goals
- attention history

I chose PostgreSQL to keep snapshots and history in the same database as the app grows.

## Why server-side collectors

Tokens for:

- Proxmox
- Home Assistant
- Plex
- job services
- security feeds

must not reach the browser.

All external calls should originate server-side. Mock collectors must follow the same collector, normalization, attention, and API path as future real integrations so that replacing a mock does not require rewriting a client.

## API compatibility

- Start client routes at `/api/v1`.
- Define runtime-validated schemas and generate or share OpenAPI-compatible contracts where practical.
- Never expose internal persistence records as accidental public contracts.
- Prefer additive changes within a version; create a new version for breaking changes.
- Keep API responses platform-neutral JSON so future Swift clients can consume them.
