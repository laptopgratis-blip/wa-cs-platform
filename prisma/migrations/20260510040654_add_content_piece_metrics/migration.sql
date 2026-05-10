-- AlterTable
ALTER TABLE "ContentPiece"
  ADD COLUMN "reach" INTEGER,
  ADD COLUMN "impressions" INTEGER,
  ADD COLUMN "saves" INTEGER,
  ADD COLUMN "shares" INTEGER,
  ADD COLUMN "comments" INTEGER,
  ADD COLUMN "dms" INTEGER,
  ADD COLUMN "linkClicks" INTEGER,
  ADD COLUMN "metricUpdatedAt" TIMESTAMP(3);

-- CreateIndex (untuk insights query — pieces dgn metric & reach desc)
CREATE INDEX "ContentPiece_userId_metricUpdatedAt_idx" ON "ContentPiece"("userId", "metricUpdatedAt");
