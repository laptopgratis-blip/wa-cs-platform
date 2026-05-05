-- ─── AiModel.costMode ─────────────────────────────────────────
ALTER TABLE "AiModel" ADD COLUMN "costMode" TEXT NOT NULL DEFAULT 'AUTO';

-- ─── Message profitability fields ─────────────────────────────
ALTER TABLE "Message" ADD COLUMN "apiInputTokens" INTEGER;
ALTER TABLE "Message" ADD COLUMN "apiOutputTokens" INTEGER;
ALTER TABLE "Message" ADD COLUMN "apiCostRp" DOUBLE PRECISION;
ALTER TABLE "Message" ADD COLUMN "tokensCharged" INTEGER;
ALTER TABLE "Message" ADD COLUMN "revenueRp" DOUBLE PRECISION;
ALTER TABLE "Message" ADD COLUMN "profitRp" DOUBLE PRECISION;

CREATE INDEX "Message_createdAt_idx" ON "Message"("createdAt");

-- ─── PricingSettings (singleton) ──────────────────────────────
CREATE TABLE "PricingSettings" (
  "id" TEXT NOT NULL,
  "marginTarget" DOUBLE PRECISION NOT NULL DEFAULT 50,
  "estimatedInputTokens" INTEGER NOT NULL DEFAULT 1600,
  "estimatedOutputTokens" INTEGER NOT NULL DEFAULT 300,
  "usdRate" DOUBLE PRECISION NOT NULL DEFAULT 16000,
  "pricePerToken" DOUBLE PRECISION NOT NULL DEFAULT 2,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PricingSettings_pkey" PRIMARY KEY ("id")
);

-- Seed default singleton row supaya app tidak null saat pertama dipanggil.
INSERT INTO "PricingSettings" ("id", "marginTarget", "estimatedInputTokens", "estimatedOutputTokens", "usdRate", "pricePerToken", "updatedAt")
VALUES ('default', 50, 1600, 300, 16000, 2, CURRENT_TIMESTAMP);

-- ─── Alert ────────────────────────────────────────────────────
CREATE TABLE "Alert" (
  "id" TEXT NOT NULL,
  "level" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "metadata" JSONB,
  "isRead" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Alert_isRead_createdAt_idx" ON "Alert"("isRead", "createdAt");
