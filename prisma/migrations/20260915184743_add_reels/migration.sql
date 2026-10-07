-- CreateTable
CREATE TABLE "reels" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "businessType" TEXT NOT NULL DEFAULT 'OTHER',
    "description" TEXT NOT NULL DEFAULT '',
    "platform" TEXT NOT NULL DEFAULT 'INSTAGRAM',
    "theme" TEXT NOT NULL DEFAULT 'BUSINESS',
    "tone" TEXT NOT NULL DEFAULT 'PROFESSIONAL',
    "style" TEXT NOT NULL DEFAULT 'MODERN',
    "musicMood" TEXT NOT NULL DEFAULT 'UPBEAT',
    "durationSec" INTEGER NOT NULL DEFAULT 30,
    "scenes" JSONB NOT NULL,
    "caption" TEXT NOT NULL DEFAULT '',
    "hashtags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ctaText" TEXT NOT NULL DEFAULT '',
    "primaryColor" TEXT NOT NULL DEFAULT '#111111',
    "secondaryColor" TEXT NOT NULL DEFAULT '#444444',
    "accentColor" TEXT NOT NULL DEFAULT '#C27A2C',
    "fontFamily" TEXT NOT NULL DEFAULT 'Inter',
    "logoUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "posterUrl" TEXT,
    "videoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "reels_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reels_tenantId_createdAt_idx" ON "reels"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "reels_slug_tenantId_key" ON "reels"("slug", "tenantId");

-- AddForeignKey
ALTER TABLE "reels" ADD CONSTRAINT "reels_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reels" ADD CONSTRAINT "reels_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
