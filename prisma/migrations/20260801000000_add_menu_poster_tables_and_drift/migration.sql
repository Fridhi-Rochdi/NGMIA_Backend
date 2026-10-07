-- Repair migration.
--
-- The `menus` and `posters` tables (and several columns on `contents`, `images`
-- and `websites`) were introduced with `prisma db push` and never captured in a
-- migration, which made `prisma migrate deploy` fail on a fresh database:
-- 20260802000000_add_artwork_font_sizes ALTERs tables that no migration created.
--
-- This migration is ordered just before that one so the history replays cleanly.
-- `menus.fontSizes`, `posters.fontSizes` and `posters.sections` are deliberately
-- omitted here: they are added by 20260802000000_add_artwork_font_sizes.

-- AlterTable
ALTER TABLE "contents" ADD COLUMN     "imageUrl" TEXT;

-- AlterTable
ALTER TABLE "images" ADD COLUMN     "accentColor" TEXT,
ADD COLUMN     "businessName" TEXT,
ADD COLUMN     "businessType" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "enhancedPrompt" TEXT,
ADD COLUMN     "fontFamily" TEXT,
ADD COLUMN     "primaryColor" TEXT,
ADD COLUMN     "secondaryColor" TEXT,
ADD COLUMN     "template" TEXT;

-- AlterTable
ALTER TABLE "websites" ADD COLUMN     "content" JSONB,
ADD COLUMN     "deploymentStatus" TEXT,
ADD COLUMN     "fontFamily" TEXT NOT NULL DEFAULT 'Inter',
ADD COLUMN     "logoText" TEXT,
ADD COLUMN     "logoUrl" TEXT,
ADD COLUMN     "vercelDeploymentId" TEXT,
ADD COLUMN     "vercelProjectId" TEXT,
ADD COLUMN     "vercelUrl" TEXT;

-- CreateTable
CREATE TABLE "menus" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "businessType" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "categories" JSONB NOT NULL,
    "template" TEXT NOT NULL DEFAULT 'MODERN',
    "primaryColor" TEXT NOT NULL DEFAULT '#3b82f6',
    "secondaryColor" TEXT NOT NULL DEFAULT '#1e3a8a',
    "accentColor" TEXT NOT NULL DEFAULT '#22c55e',
    "fontFamily" TEXT NOT NULL DEFAULT 'Inter',
    "html" TEXT NOT NULL,
    "css" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "vercelUrl" TEXT,
    "qrCodeUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "menus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "posters" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "businessType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "template" TEXT NOT NULL DEFAULT 'MODERN',
    "size" TEXT NOT NULL DEFAULT 'SQUARE',
    "primaryColor" TEXT NOT NULL DEFAULT '#1a1a2e',
    "secondaryColor" TEXT NOT NULL DEFAULT '#16213e',
    "accentColor" TEXT NOT NULL DEFAULT '#e94560',
    "fontFamily" TEXT NOT NULL DEFAULT 'Inter',
    "content" TEXT,
    "imageUrl" TEXT,
    "slug" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "vercelUrl" TEXT,
    "qrCodeUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "posters_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "menus" ADD CONSTRAINT "menus_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menus" ADD CONSTRAINT "menus_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posters" ADD CONSTRAINT "posters_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posters" ADD CONSTRAINT "posters_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

