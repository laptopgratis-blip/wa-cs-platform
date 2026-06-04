-- CreateEnum
CREATE TYPE "HostMode" AS ENUM ('TTS_GENERATIVE', 'NATIVE_LIBRARY');

-- CreateEnum
CREATE TYPE "ClipCategory" AS ENUM ('GREETING', 'PRODUCT_DEMO', 'PRICE', 'OBJECTION', 'CLOSING', 'IDLE', 'GENERAL');

-- CreateEnum
CREATE TYPE "ClipSource" AS ENUM ('GENERATED', 'UPLOADED');

-- CreateEnum
CREATE TYPE "LiveClipStatus" AS ENUM ('DRAFT', 'GENERATING_AUDIO', 'GENERATING_VIDEO', 'PROCESSING_EMBEDDING', 'READY', 'FAILED');

-- AlterTable
ALTER TABLE "HostTemplate" ADD COLUMN     "backgroundId" TEXT,
ADD COLUMN     "imageApprovedAt" TIMESTAMP(3),
ADD COLUMN     "mode" "HostMode" NOT NULL DEFAULT 'TTS_GENERATIVE',
ADD COLUMN     "productImageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "productPlacement" TEXT,
ADD COLUMN     "visionAnalysis" JSONB,
ADD COLUMN     "visionAnalyzedAt" TIMESTAMP(3),
ADD COLUMN     "visualHookCustom" TEXT,
ADD COLUMN     "visualHookId" TEXT;

-- CreateTable
CREATE TABLE "LiveClip" (
    "id" TEXT NOT NULL,
    "hostTemplateId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scriptOriginal" TEXT NOT NULL,
    "transcript" TEXT NOT NULL,
    "summary" TEXT,
    "category" "ClipCategory" NOT NULL DEFAULT 'GENERAL',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "productId" TEXT,
    "audioUrl" TEXT,
    "videoUrl" TEXT,
    "thumbnailUrl" TEXT,
    "durationMs" INTEGER,
    "embedding" JSONB,
    "embeddingModel" TEXT,
    "source" "ClipSource" NOT NULL DEFAULT 'GENERATED',
    "klingJobId" TEXT,
    "status" "LiveClipStatus" NOT NULL DEFAULT 'DRAFT',
    "errorMessage" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isEvergreen" BOOLEAN NOT NULL DEFAULT false,
    "isDefaultIdle" BOOLEAN NOT NULL DEFAULT false,
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "avgConfidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiveClip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveClipUsage" (
    "id" TEXT NOT NULL,
    "clipId" TEXT NOT NULL,
    "liveSessionId" TEXT,
    "question" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "matchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiveClipUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackgroundPreset" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "nameId" TEXT NOT NULL,
    "nameEn" TEXT,
    "description" TEXT NOT NULL,
    "promptFragment" TEXT NOT NULL,
    "motionHint" TEXT,
    "thumbnailUrl" TEXT NOT NULL,
    "vibeTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BackgroundPreset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisualHookPreset" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "nameId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "promptFragment" TEXT NOT NULL,
    "stabilityHints" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "vibeTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cautionFlags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "thumbnailUrl" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisualHookPreset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LiveClip_hostTemplateId_isActive_status_idx" ON "LiveClip"("hostTemplateId", "isActive", "status");

-- CreateIndex
CREATE INDEX "LiveClip_userId_createdAt_idx" ON "LiveClip"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "LiveClip_category_isActive_idx" ON "LiveClip"("category", "isActive");

-- CreateIndex
CREATE INDEX "LiveClipUsage_clipId_matchedAt_idx" ON "LiveClipUsage"("clipId", "matchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BackgroundPreset_slug_key" ON "BackgroundPreset"("slug");

-- CreateIndex
CREATE INDEX "BackgroundPreset_category_isActive_sortOrder_idx" ON "BackgroundPreset"("category", "isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "VisualHookPreset_slug_key" ON "VisualHookPreset"("slug");

-- CreateIndex
CREATE INDEX "VisualHookPreset_category_isActive_sortOrder_idx" ON "VisualHookPreset"("category", "isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "HostTemplate_mode_idx" ON "HostTemplate"("mode");

-- AddForeignKey
ALTER TABLE "HostTemplate" ADD CONSTRAINT "HostTemplate_backgroundId_fkey" FOREIGN KEY ("backgroundId") REFERENCES "BackgroundPreset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HostTemplate" ADD CONSTRAINT "HostTemplate_visualHookId_fkey" FOREIGN KEY ("visualHookId") REFERENCES "VisualHookPreset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveClip" ADD CONSTRAINT "LiveClip_hostTemplateId_fkey" FOREIGN KEY ("hostTemplateId") REFERENCES "HostTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveClipUsage" ADD CONSTRAINT "LiveClipUsage_clipId_fkey" FOREIGN KEY ("clipId") REFERENCES "LiveClip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
