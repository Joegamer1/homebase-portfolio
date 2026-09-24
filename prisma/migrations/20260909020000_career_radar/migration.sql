CREATE TABLE "CareerProfile" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currentSalary" INTEGER NOT NULL DEFAULT 70000,
    "minimumSalary" INTEGER NOT NULL DEFAULT 75000,
    "preferredSalary" INTEGER NOT NULL DEFAULT 85000,
    "locations" JSONB NOT NULL,
    "allowRemote" BOOLEAN NOT NULL DEFAULT true,
    "targetTitles" JSONB NOT NULL,
    "targetSkills" JSONB NOT NULL,
    "advancementTerms" JSONB NOT NULL,
    "regressionTerms" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CareerProfile_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "JobPosting"
ADD COLUMN "employmentType" TEXT,
ADD COLUMN "salaryCurrency" TEXT,
ADD COLUMN "description" TEXT,
ADD COLUMN "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "JobPosting_postedAt_idx" ON "JobPosting"("postedAt");
