CREATE TABLE "IntegrationSnapshot" (
  "id" TEXT NOT NULL,
  "integrationKey" TEXT NOT NULL,
  "collectedAt" TIMESTAMP(3) NOT NULL,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IntegrationSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IntegrationSnapshot_integrationKey_key" ON "IntegrationSnapshot"("integrationKey");
