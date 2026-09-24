UPDATE "TechnologyInventory"
SET "metadata" = '{"aliases":["debian operating system","debian linux kernel"]}'::jsonb,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'tech-debian';
