ALTER TABLE "UserSettings"
ADD COLUMN "currentSalary" INTEGER NOT NULL DEFAULT 70000,
ADD COLUMN "minimumSalary" INTEGER NOT NULL DEFAULT 75000,
ADD COLUMN "preferredSalary" INTEGER NOT NULL DEFAULT 85000,
ADD COLUMN "careerLocations" JSONB NOT NULL DEFAULT '["Dayton, OH", "Columbus, OH", "Cincinnati, OH"]',
ADD COLUMN "allowRemoteJobs" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "MediaItem" (
  "id" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "parentTitle" TEXT,
  "source" TEXT NOT NULL,
  "addedAt" TIMESTAMP(3) NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MediaItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MediaItem_source_externalId_key" ON "MediaItem"("source", "externalId");
CREATE INDEX "MediaItem_addedAt_idx" ON "MediaItem"("addedAt");
