# Docker telemetry adapter

Runs on the Debian Docker VM. HOMEBASE itself never receives the Docker socket.
Only the HOMEBASE Tailscale address can request container list/inspection GETs.
Every response is reduced to monitoring fields; environment variables, labels,
mounts, health-check output and credentials are excluded. All other paths and
methods are rejected. The port binds only to the Docker VM's Tailscale address.
The same adapter exposes a filtered `GET /tailscale/status` response from the
local Tailscale socket. It returns backend state and peer reachability only.

The adapter's socket access is privileged even with a read-only mount. It runs
as an unprivileged UID with the socket's group, drops capabilities, and uses a
read-only filesystem. Keep this small adapter private and review any changes.

Set DOCKER_MONITOR_UID to the deployment user's UID and DOCKER_MONITOR_GID to
the Docker socket group ID in a local .env. Run `docker compose up -d`.
