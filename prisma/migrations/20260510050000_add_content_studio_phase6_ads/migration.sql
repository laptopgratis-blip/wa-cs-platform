-- Content Studio Phase 6 — Ads creative copy generator (Meta Ads + TikTok Ads)
--
-- Extend ContentPiece dengan diskriminator pieceType (ORGANIC | ADS) +
-- adsPlatform + adsFormat. Tabel baru AdVariant untuk simpan multi headline/
-- primary text/description/CTA (A/B test) dengan performance metric per
-- variant. Seed AiFeatureConfig 'ADS_GENERATE'.

-- ── ContentPiece extension ─────────────────────────────────────────────
ALTER TABLE "ContentPiece"
  ADD COLUMN "pieceType"   TEXT NOT NULL DEFAULT 'ORGANIC',
  ADD COLUMN "adsPlatform" TEXT,
  ADD COLUMN "adsFormat"   TEXT;

CREATE INDEX "ContentPiece_userId_pieceType_status_idx"
  ON "ContentPiece"("userId", "pieceType", "status");

-- ── AdVariant ──────────────────────────────────────────────────────────
CREATE TABLE "AdVariant" (
  "id"              TEXT NOT NULL,
  "pieceId"         TEXT NOT NULL,
  "variantType"     TEXT NOT NULL,
  "value"           TEXT NOT NULL,
  "order"           INTEGER NOT NULL DEFAULT 0,
  "impressions"     INTEGER,
  "clicks"          INTEGER,
  "ctr"             DOUBLE PRECISION,
  "conversions"     INTEGER,
  "spendRp"         INTEGER,
  "metricUpdatedAt" TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdVariant_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AdVariant_pieceId_variantType_order_idx"
  ON "AdVariant"("pieceId", "variantType", "order");

ALTER TABLE "AdVariant"
  ADD CONSTRAINT "AdVariant_pieceId_fkey"
  FOREIGN KEY ("pieceId") REFERENCES "ContentPiece"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Seed AiFeatureConfig ADS_GENERATE (idempotent) ─────────────────────
INSERT INTO "AiFeatureConfig" (
  "id", "featureKey", "displayName", "modelName",
  "inputPricePer1M", "outputPricePer1M",
  "platformMargin", "floorTokens", "capTokens", "isActive", "description",
  "createdAt", "updatedAt"
)
VALUES (
  'seed_cs_ads_' || REPLACE(gen_random_uuid()::TEXT, '-', ''),
  'ADS_GENERATE',
  'Ads Creative Generator',
  'claude-haiku-4-5',
  1.0, 5.0,
  1.3, 300, 100000, TRUE,
  'Generate copy iklan Meta Ads & TikTok Ads — 5 headlines + 3 primary text + description + CTA + visual brief + storyboard video.',
  NOW(), NOW()
)
ON CONFLICT ("featureKey") DO NOTHING;
