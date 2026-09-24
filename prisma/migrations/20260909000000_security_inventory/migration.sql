ALTER TABLE "TechnologyInventory"
ADD COLUMN "confidence" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN "enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "metadata" JSONB;

INSERT INTO "TechnologyInventory" ("id", "product", "vendor", "version", "source", "confidence", "enabled", "metadata", "detectedAt", "updatedAt")
SELECT seed.id, seed.product, seed.vendor, seed.version, 'manual-seed', 80, true, seed.metadata::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (VALUES
  ('tech-debian', 'Debian', 'Debian', NULL, '{"aliases":["debian operating system","debian linux kernel"]}'),
  ('tech-proxmox', 'Proxmox VE', 'Proxmox', NULL, '{"aliases":["proxmox","pve"]}'),
  ('tech-docker', 'Docker', 'Docker', NULL, '{"aliases":["docker engine","moby"]}'),
  ('tech-plex', 'Plex Media Server', 'Plex', '1.43.3.10896-cb3ebc72d', '{"aliases":["plex"]}'),
  ('tech-pihole', 'Pi-hole', 'Pi-hole', '6.4.2', '{"aliases":["pihole"]}'),
  ('tech-nginx-proxy-manager', 'Nginx Proxy Manager', 'Nginx Proxy Manager', NULL, '{"aliases":["nginx proxy manager"]}'),
  ('tech-home-assistant', 'Home Assistant', 'Home Assistant', '2026.8.3', '{"aliases":["home-assistant"]}'),
  ('tech-tailscale', 'Tailscale', 'Tailscale', '1.102.2', '{"aliases":["tailscale"]}'),
  ('tech-portainer', 'Portainer', 'Portainer', NULL, '{"aliases":["portainer ce"]}')
) AS seed(id, product, vendor, version, metadata)
WHERE NOT EXISTS (
  SELECT 1 FROM "TechnologyInventory" existing
  WHERE lower(existing."product") = lower(seed.product)
);
