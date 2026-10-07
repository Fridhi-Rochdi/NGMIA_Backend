-- CreateTable
CREATE TABLE "business_contexts" (
    "id" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "businessType" TEXT NOT NULL DEFAULT 'OTHER',
    "industry" TEXT,
    "description" TEXT NOT NULL DEFAULT '',
    "services" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "targetAudience" TEXT,
    "tone" TEXT NOT NULL DEFAULT 'professional',
    "language" TEXT NOT NULL DEFAULT 'fr',
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "contactPhone" TEXT,
    "contactEmail" TEXT,
    "contactAddress" TEXT,
    "website" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "business_contexts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "business_contexts_tenantId_key" ON "business_contexts"("tenantId");

-- AddForeignKey
ALTER TABLE "business_contexts" ADD CONSTRAINT "business_contexts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
