-- CreateTable
CREATE TABLE "public"."registry_feed_cursor" (
    "feed" TEXT NOT NULL,
    "lastUpdateId" INTEGER NOT NULL,
    "lastUpdateAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "registry_feed_cursor_pkey" PRIMARY KEY ("feed")
);

-- CreateTable
CREATE TABLE "public"."registry_address_state" (
    "organizationNumber" TEXT NOT NULL,
    "name" TEXT,
    "addressLines" JSONB,
    "address" TEXT,
    "postalCode" TEXT,
    "city" TEXT,
    "kommuneNumber" TEXT,
    "kommuneName" TEXT,
    "kommuneChangedAt" TIMESTAMP(3),
    "lastAddressAt" TIMESTAMP(3),
    "asOf" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,

    CONSTRAINT "registry_address_state_pkey" PRIMARY KEY ("organizationNumber")
);

-- CreateTable
CREATE TABLE "public"."address_moves" (
    "id" TEXT NOT NULL,
    "updateId" INTEGER NOT NULL,
    "organizationNumber" TEXT NOT NULL,
    "companyName" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL,
    "moveType" TEXT NOT NULL,
    "fromAddress" TEXT,
    "fromPostalCode" TEXT,
    "fromCity" TEXT,
    "fromKommuneNumber" TEXT,
    "fromKommuneName" TEXT,
    "toAddress" TEXT,
    "toPostalCode" TEXT,
    "toCity" TEXT,
    "toKommuneNumber" TEXT,
    "toKommuneName" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "address_moves_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."bankruptcy_events" (
    "id" TEXT NOT NULL,
    "updateId" INTEGER NOT NULL,
    "organizationNumber" TEXT NOT NULL,
    "companyName" TEXT,
    "eventType" TEXT NOT NULL,
    "eventDate" TIMESTAMP(3) NOT NULL,
    "registeredAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bankruptcy_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "registry_address_state_kommuneNumber_idx" ON "public"."registry_address_state"("kommuneNumber");

-- CreateIndex
CREATE UNIQUE INDEX "address_moves_updateId_key" ON "public"."address_moves"("updateId");

-- CreateIndex
CREATE INDEX "address_moves_organizationNumber_idx" ON "public"."address_moves"("organizationNumber");

-- CreateIndex
CREATE INDEX "address_moves_changedAt_idx" ON "public"."address_moves"("changedAt");

-- CreateIndex
CREATE INDEX "address_moves_resolvedAt_idx" ON "public"."address_moves"("resolvedAt");

-- CreateIndex
CREATE INDEX "address_moves_toKommuneNumber_changedAt_idx" ON "public"."address_moves"("toKommuneNumber", "changedAt");

-- CreateIndex
CREATE INDEX "address_moves_fromKommuneNumber_changedAt_idx" ON "public"."address_moves"("fromKommuneNumber", "changedAt");

-- CreateIndex
CREATE INDEX "bankruptcy_events_organizationNumber_idx" ON "public"."bankruptcy_events"("organizationNumber");

-- CreateIndex
CREATE INDEX "bankruptcy_events_eventType_eventDate_idx" ON "public"."bankruptcy_events"("eventType", "eventDate");

-- CreateIndex
CREATE UNIQUE INDEX "bankruptcy_events_updateId_eventType_key" ON "public"."bankruptcy_events"("updateId", "eventType");

