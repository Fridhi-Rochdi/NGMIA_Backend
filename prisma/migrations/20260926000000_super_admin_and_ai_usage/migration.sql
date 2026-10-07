-- Platform operator flag, separate from the tenant-level UserRole.
ALTER TABLE "users" ADD COLUMN "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false;

-- The super-admin used to be recognised by role = 'ADMIN'. Only the bootstrap
-- account (tenant "admin") ever received that role, so carry exactly it over.
UPDATE "users" SET "isSuperAdmin" = true
WHERE "role" = 'ADMIN'
  AND "tenantId" IN (SELECT "id" FROM "tenants" WHERE "slug" = 'admin');

-- Billable AI generations, for per-plan monthly quotas.
CREATE TABLE "ai_usage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "feature" TEXT NOT NULL,
    "credits" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_usage_tenantId_createdAt_idx" ON "ai_usage"("tenantId", "createdAt");

ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
