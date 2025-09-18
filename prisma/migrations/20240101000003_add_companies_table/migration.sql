-- CreateTable
CREATE TABLE "companies" (
    "id" SERIAL NOT NULL,
    "organization_number" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "business_address" JSONB NOT NULL,
    "postal_address" JSONB,
    "industry" JSONB NOT NULL,
    "organization_form" JSONB NOT NULL,
    "registration_date" TEXT NOT NULL,
    "last_updated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "key_persons" JSONB NOT NULL DEFAULT '[]',
    "risk_score" INTEGER NOT NULL DEFAULT 0,
    "tags" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "companies_organization_number_key" ON "companies"("organization_number");

-- CreateIndex
CREATE INDEX "companies_risk_score_idx" ON "companies"("risk_score");

-- CreateIndex
CREATE INDEX "companies_last_updated_idx" ON "companies"("last_updated");

-- CreateIndex  
CREATE INDEX "companies_tags_idx" ON "companies" USING GIN ("tags");

-- CreateIndex
CREATE INDEX "companies_key_persons_idx" ON "companies" USING GIN ("key_persons");
