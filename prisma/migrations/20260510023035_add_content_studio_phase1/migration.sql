-- CreateTable
CREATE TABLE "AiFeatureConfig" (
    "id" TEXT NOT NULL,
    "featureKey" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "inputPricePer1M" DOUBLE PRECISION NOT NULL,
    "outputPricePer1M" DOUBLE PRECISION NOT NULL,
    "platformMargin" DOUBLE PRECISION NOT NULL DEFAULT 1.3,
    "floorTokens" INTEGER NOT NULL DEFAULT 100,
    "capTokens" INTEGER NOT NULL DEFAULT 50000,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiFeatureConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiGenerationLog" (
    "id" TEXT NOT NULL,
    "featureKey" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subjectType" TEXT,
    "subjectId" TEXT,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "apiCostUsd" DOUBLE PRECISION NOT NULL,
    "apiCostRp" DOUBLE PRECISION NOT NULL,
    "tokensCharged" INTEGER NOT NULL,
    "revenueRp" DOUBLE PRECISION NOT NULL,
    "profitRp" DOUBLE PRECISION NOT NULL,
    "marginPct" DOUBLE PRECISION NOT NULL,
    "modelName" TEXT NOT NULL,
    "pricingSnapshot" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OK',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiGenerationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentIdea" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lpId" TEXT,
    "method" TEXT NOT NULL,
    "hook" TEXT NOT NULL,
    "angle" TEXT NOT NULL,
    "channelFit" TEXT[],
    "format" TEXT NOT NULL,
    "whyItWorks" TEXT NOT NULL,
    "predictedVirality" INTEGER NOT NULL DEFAULT 3,
    "funnelStage" TEXT NOT NULL,
    "estimatedTokens" INTEGER NOT NULL DEFAULT 800,
    "isFreePreview" BOOLEAN NOT NULL DEFAULT false,
    "promotedToPieceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentIdea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentBrief" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lpId" TEXT,
    "manualTitle" TEXT,
    "manualAudience" TEXT,
    "manualOffer" TEXT,
    "tone" TEXT NOT NULL DEFAULT 'CASUAL',
    "funnelMix" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentBrief_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentPiece" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "briefId" TEXT,
    "sourceIdeaId" TEXT,
    "channel" TEXT NOT NULL,
    "funnelStage" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "bodyJson" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "tokensCharged" INTEGER NOT NULL DEFAULT 0,
    "postedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentPiece_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentSlide" (
    "id" TEXT NOT NULL,
    "pieceId" TEXT NOT NULL,
    "slideIndex" INTEGER NOT NULL,
    "headline" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "templateId" TEXT,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentSlide_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiFeatureConfig_featureKey_key" ON "AiFeatureConfig"("featureKey");

-- CreateIndex
CREATE INDEX "AiGenerationLog_featureKey_createdAt_idx" ON "AiGenerationLog"("featureKey", "createdAt");

-- CreateIndex
CREATE INDEX "AiGenerationLog_userId_createdAt_idx" ON "AiGenerationLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AiGenerationLog_status_createdAt_idx" ON "AiGenerationLog"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ContentIdea_promotedToPieceId_key" ON "ContentIdea"("promotedToPieceId");

-- CreateIndex
CREATE INDEX "ContentIdea_userId_createdAt_idx" ON "ContentIdea"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ContentIdea_lpId_createdAt_idx" ON "ContentIdea"("lpId", "createdAt");

-- CreateIndex
CREATE INDEX "ContentBrief_userId_createdAt_idx" ON "ContentBrief"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ContentBrief_lpId_createdAt_idx" ON "ContentBrief"("lpId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ContentPiece_sourceIdeaId_key" ON "ContentPiece"("sourceIdeaId");

-- CreateIndex
CREATE INDEX "ContentPiece_userId_status_createdAt_idx" ON "ContentPiece"("userId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ContentPiece_briefId_createdAt_idx" ON "ContentPiece"("briefId", "createdAt");

-- CreateIndex
CREATE INDEX "ContentPiece_channel_status_idx" ON "ContentPiece"("channel", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ContentSlide_pieceId_slideIndex_key" ON "ContentSlide"("pieceId", "slideIndex");

-- CreateIndex
CREATE INDEX "ContentSlide_pieceId_idx" ON "ContentSlide"("pieceId");

-- AddForeignKey
ALTER TABLE "AiGenerationLog" ADD CONSTRAINT "AiGenerationLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentIdea" ADD CONSTRAINT "ContentIdea_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentIdea" ADD CONSTRAINT "ContentIdea_lpId_fkey" FOREIGN KEY ("lpId") REFERENCES "LandingPage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentIdea" ADD CONSTRAINT "ContentIdea_promotedToPieceId_fkey" FOREIGN KEY ("promotedToPieceId") REFERENCES "ContentPiece"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentBrief" ADD CONSTRAINT "ContentBrief_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentBrief" ADD CONSTRAINT "ContentBrief_lpId_fkey" FOREIGN KEY ("lpId") REFERENCES "LandingPage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentPiece" ADD CONSTRAINT "ContentPiece_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentPiece" ADD CONSTRAINT "ContentPiece_briefId_fkey" FOREIGN KEY ("briefId") REFERENCES "ContentBrief"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentSlide" ADD CONSTRAINT "ContentSlide_pieceId_fkey" FOREIGN KEY ("pieceId") REFERENCES "ContentPiece"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed default AiFeatureConfig untuk Content Studio (idempotent — skip kalau sudah ada).
INSERT INTO "AiFeatureConfig" (
  "id", "featureKey", "displayName", "modelName",
  "inputPricePer1M", "outputPricePer1M",
  "platformMargin", "floorTokens", "capTokens", "isActive", "description",
  "createdAt", "updatedAt"
)
VALUES
  (
    'seed_cs_idea_' || REPLACE(gen_random_uuid()::TEXT, '-', ''),
    'CONTENT_IDEA',
    'Idea Generator',
    'claude-haiku-4-5',
    1.0, 5.0,
    1.3, 100, 50000, TRUE,
    'Generator 15 ide konten via 3 metode (Hook framework, Pain-point, Persona POV).',
    NOW(), NOW()
  ),
  (
    'seed_cs_gen_' || REPLACE(gen_random_uuid()::TEXT, '-', ''),
    'CONTENT_GENERATE',
    'Content Generation',
    'claude-haiku-4-5',
    1.0, 5.0,
    1.3, 200, 100000, TRUE,
    'Generate konten full body per channel sosmed (WA Status, IG Story/Post/Carousel/Reels, TikTok script).',
    NOW(), NOW()
  )
ON CONFLICT ("featureKey") DO NOTHING;
