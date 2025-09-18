-- CreateTable
CREATE TABLE "public"."kommuner" (
    "id" TEXT NOT NULL,
    "kommuneNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "county" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kommuner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."bankruptcies" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "organizationNumber" TEXT NOT NULL,
    "bankruptcyDate" TIMESTAMP(3) NOT NULL,
    "address" TEXT,
    "industry" TEXT,
    "hasRecentAddressChange" BOOLEAN NOT NULL DEFAULT false,
    "kommuneId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastChecked" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceUrl" TEXT,
    "sourceSystem" TEXT,

    CONSTRAINT "bankruptcies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."address_changes" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "organizationNumber" TEXT NOT NULL,
    "changeDate" TIMESTAMP(3) NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "toAddress" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "kommuneId" TEXT NOT NULL,
    "bankruptcyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "address_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."data_sync_logs" (
    "id" TEXT NOT NULL,
    "syncType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "recordsProcessed" INTEGER,
    "recordsAdded" INTEGER,
    "recordsUpdated" INTEGER,
    "recordsFailed" INTEGER,
    "kommuneId" TEXT,
    "errorMessage" TEXT,
    "metadata" JSONB,

    CONSTRAINT "data_sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "kommuner_kommuneNumber_key" ON "public"."kommuner"("kommuneNumber");

-- CreateIndex
CREATE UNIQUE INDEX "bankruptcies_organizationNumber_key" ON "public"."bankruptcies"("organizationNumber");

-- CreateIndex
CREATE INDEX "bankruptcies_kommuneId_idx" ON "public"."bankruptcies"("kommuneId");

-- CreateIndex
CREATE INDEX "bankruptcies_bankruptcyDate_idx" ON "public"."bankruptcies"("bankruptcyDate");

-- CreateIndex
CREATE INDEX "bankruptcies_organizationNumber_idx" ON "public"."bankruptcies"("organizationNumber");

-- CreateIndex
CREATE INDEX "address_changes_kommuneId_idx" ON "public"."address_changes"("kommuneId");

-- CreateIndex
CREATE INDEX "address_changes_organizationNumber_idx" ON "public"."address_changes"("organizationNumber");

-- CreateIndex
CREATE INDEX "address_changes_changeDate_idx" ON "public"."address_changes"("changeDate");

-- CreateIndex
CREATE INDEX "data_sync_logs_syncType_idx" ON "public"."data_sync_logs"("syncType");

-- CreateIndex
CREATE INDEX "data_sync_logs_status_idx" ON "public"."data_sync_logs"("status");

-- CreateIndex
CREATE INDEX "data_sync_logs_startedAt_idx" ON "public"."data_sync_logs"("startedAt");

-- AddForeignKey
ALTER TABLE "public"."bankruptcies" ADD CONSTRAINT "bankruptcies_kommuneId_fkey" FOREIGN KEY ("kommuneId") REFERENCES "public"."kommuner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."address_changes" ADD CONSTRAINT "address_changes_kommuneId_fkey" FOREIGN KEY ("kommuneId") REFERENCES "public"."kommuner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."address_changes" ADD CONSTRAINT "address_changes_bankruptcyId_fkey" FOREIGN KEY ("bankruptcyId") REFERENCES "public"."bankruptcies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
