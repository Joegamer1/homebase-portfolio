CREATE TABLE "GamePreference" (
  "id" TEXT NOT NULL,
  "game" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "queues" JSONB NOT NULL DEFAULT '[]',
  "roles" JSONB NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GamePreference_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GamePreference_game_entityId_key" ON "GamePreference"("game", "entityId");
CREATE TABLE "GameUpdateState" ("id" TEXT NOT NULL, "updateKey" TEXT NOT NULL, "saved" BOOLEAN NOT NULL DEFAULT false, "read" BOOLEAN NOT NULL DEFAULT false, "dismissed" BOOLEAN NOT NULL DEFAULT false, "note" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "GameUpdateState_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "GameUpdateState_updateKey_key" ON "GameUpdateState"("updateKey");
CREATE TABLE "FamilySelection" ("id" TEXT NOT NULL, "kind" TEXT NOT NULL, "externalId" TEXT NOT NULL, "label" TEXT NOT NULL, "area" TEXT, "threshold" JSONB, "active" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "FamilySelection_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "FamilySelection_kind_externalId_key" ON "FamilySelection"("kind", "externalId");
CREATE TABLE "FamilyReminder" ("id" TEXT NOT NULL, "title" TEXT NOT NULL, "dueAt" TIMESTAMP(3), "completed" BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "FamilyReminder_pkey" PRIMARY KEY ("id"));
CREATE TABLE "FamilyAlertState" ("id" TEXT NOT NULL, "alertKey" TEXT NOT NULL, "acknowledged" BOOLEAN NOT NULL DEFAULT false, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "FamilyAlertState_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "FamilyAlertState_alertKey_key" ON "FamilyAlertState"("alertKey");
