#!/usr/bin/env bash

set -euo pipefail

env_file="${1:-.env}"

if [[ ! -f "docker-compose.yml" ]]; then
  echo "Run this command from the homebase project directory." >&2
  exit 1
fi

umask 077
touch "$env_file"
chmod 600 "$env_file"

upsert_secret() {
  local key="$1"
  local value="$2"
  local temporary

  temporary="$(mktemp "${env_file}.XXXXXX")"
  grep -v "^${key}=" "$env_file" > "$temporary" || true
  printf '%s=%s\n' "$key" "$value" >> "$temporary"
  mv "$temporary" "$env_file"
  chmod 600 "$env_file"
}

read_secret() {
  local key="$1"
  local label="$2"
  local value

  read -r -s -p "$label (leave blank to keep the current value): " value
  printf '\n'

  if [[ -n "$value" ]]; then
    upsert_secret "$key" "$value"
    echo "$label saved."
  else
    echo "$label unchanged."
  fi

  unset value
}

read_secret "PIHOLE_APP_PASSWORD" "Pi-hole application password"
read_secret "PLEX_TOKEN" "Plex token"
read_secret "HOME_ASSISTANT_TOKEN" "Home Assistant long-lived access token"

docker compose --env-file "$env_file" up -d --force-recreate api web

echo "Phase 3 credentials applied. HOMEBASE is restarting the API and web services."
