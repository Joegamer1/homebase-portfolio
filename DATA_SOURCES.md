# DATA SOURCES

This file tracks potential integrations.

Do not enable everything immediately.

## Homelab

### Proxmox

Use:

- Proxmox REST API
- least-privilege API token

Desired:

- nodes
- VM/LXC state
- storage
- utilization
- task failures
- backup status

### Docker

Preferred:

- restricted socket proxy
- Portainer API
- another read-only intermediary

Avoid:

- exposing raw Docker socket to browser

### Pi-hole

Desired:

- query count
- block percentage
- client count
- upstream status

### Plex

Desired:

- availability
- current sessions
- transcodes
- server version

### Home Assistant

Use:

- REST/WebSocket API
- long-lived access token
- read-only or minimally scoped setup where practical

Desired:

- unavailable entities
- selected sensors
- calendar
- alerts

### Uptime Kuma

Desired:

- monitor health
- incident state
- latency

### Tailscale

Desired:

- online peers
- offline peers
- tailnet health

---

## Security

Start authoritative:

- CISA Known Exploited Vulnerabilities
- NVD / CVE data
- vendor security advisories
- GitHub Security Advisories
- Microsoft MSRC
- Cisco advisories

Later:

- trusted threat-research RSS
- selected security researchers
- curated social sources

Never show raw volume without ranking.

---

## Career

Current:

- Greenhouse Job Board API public GET endpoints
- configurable board tokens and company labels
- deterministic mock source for scoring calibration and empty-source resilience
- GitLab and Cloudflare boards enabled by default

The Greenhouse adapter requests published jobs with descriptions, filters for
cybersecurity role titles, and stores only the normalized job fields needed by
Career Radar. It does not submit applications or scrape rendered career pages.
Configure boards with `CAREER_GREENHOUSE_BOARDS=token:Company,...`.

Preferred approaches:

- official or licensed job APIs
- RSS / feeds where available
- provider-supported search endpoints
- manual source configuration

Avoid fragile or ToS-hostile scraping.

Normalize:

- title
- company
- location
- work arrangement
- salary
- skills
- posted time
- source
- URL

---

## Games

### League of Legends

Potential:

- official patch notes: https://www.leagueoflegends.com/en-us/news/tags/patch-notes/
- educational community context: https://www.reddit.com/r/summonerschool/ (non-authoritative)
- Riot APIs
- official patch notes
- Data Dragon
- reputable stats source where permitted

Track:

- Yunara
- Katarina
- configurable future champion list

### Deadlock

Potential:

- official changelog: https://forums.playdeadlock.com/forums/changelog.10/
- reputable community data APIs where available

Track:

- Holliday
- Pocket
- configurable future hero list

---

## Family

Potential:

- Home Assistant calendar entities
- Google Calendar
- household task integrations
- Home Assistant sensors
- manually entered reminders

Family data should remain private and minimally retained.
