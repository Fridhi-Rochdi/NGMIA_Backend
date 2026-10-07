-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EventStatus" ADD VALUE 'PUBLISHING';
ALTER TYPE "EventStatus" ADD VALUE 'FAILED';

-- AlterTable
ALTER TABLE "calendar_events" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "autoPublish" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "error" TEXT,
ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "publishedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "social_accounts" ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "pageId" TEXT,
ADD COLUMN     "pageName" TEXT,
ADD COLUMN     "scope" TEXT;

-- CreateIndex
CREATE INDEX "calendar_events_status_scheduledAt_idx" ON "calendar_events"("status", "scheduledAt");
