-- AlterTable

-- AlterTable
ALTER TABLE "public"."address_moves" ADD COLUMN     "fromAsOf" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "public"."archived_snapshots" (
    "snapshotAt" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,
    "entities" INTEGER NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "archived_snapshots_pkey" PRIMARY KEY ("snapshotAt")
);

-- CreateTable
CREATE TABLE "public"."archived_company_periods" (
    "id" TEXT NOT NULL,
    "organizationNumber" TEXT NOT NULL,
    "name" TEXT,
    "organizationForm" TEXT,
    "address" TEXT,
    "postalCode" TEXT,
    "city" TEXT,
    "kommuneNumber" TEXT,
    "kommuneName" TEXT,
    "postAddress" TEXT,
    "konkurs" BOOLEAN NOT NULL DEFAULT false,
    "konkursdato" TIMESTAMP(3),
    "underAvvikling" BOOLEAN NOT NULL DEFAULT false,
    "tvangsavvikling" BOOLEAN NOT NULL DEFAULT false,
    "firstSeen" TIMESTAMP(3) NOT NULL,
    "lastSeen" TIMESTAMP(3) NOT NULL,
    "nextSeen" TIMESTAMP(3),
    "goneAfter" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "archived_company_periods_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "archived_company_periods_organizationNumber_firstSeen_idx" ON "public"."archived_company_periods"("organizationNumber", "firstSeen");

-- CreateIndex
CREATE INDEX "archived_company_periods_postalCode_idx" ON "public"."archived_company_periods"("postalCode");

-- CreateIndex
CREATE INDEX "archived_company_periods_kommuneNumber_idx" ON "public"."archived_company_periods"("kommuneNumber");

