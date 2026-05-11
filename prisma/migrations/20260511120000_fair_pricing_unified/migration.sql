-- Fair-pricing unification: semua fitur AI pakai skema sama (proporsional
-- terhadap real input/output token × harga provider × usdRate × margin).
--
-- Perubahan:
-- 1. Update default schema: floorTokens 100→10, capTokens 50000→0, platformMargin 1.3→2.0
--    (capTokens 0 = tidak di-enforce di code; pure proportional ke atas)
-- 2. Update existing rows ke margin 2.0 + floor 10 + cap 0
-- 3. Insert 4 featureKey baru: LP_GENERATE, LP_OPTIMIZE, SOUL_SIM, CS_REPLY

-- 1. Update column defaults (untuk row baru via Prisma)
ALTER TABLE "AiFeatureConfig" ALTER COLUMN "platformMargin" SET DEFAULT 2.0;
ALTER TABLE "AiFeatureConfig" ALTER COLUMN "floorTokens" SET DEFAULT 10;
ALTER TABLE "AiFeatureConfig" ALTER COLUMN "capTokens" SET DEFAULT 0;

-- 2. Normalize existing rows ke skema fair-pricing baru
UPDATE "AiFeatureConfig"
SET "platformMargin" = 2.0,
    "floorTokens" = 10,
    "capTokens" = 0,
    "updatedAt" = NOW()
WHERE "featureKey" IN ('CONTENT_IDEA', 'CONTENT_GENERATE', 'KNOWLEDGE_KEYWORD_SUGGEST', 'ADS_GENERATE');

-- 3. Seed featureKey baru (idempotent via ON CONFLICT)
INSERT INTO "AiFeatureConfig" (
  "id", "featureKey", "displayName", "modelName",
  "inputPricePer1M", "outputPricePer1M",
  "platformMargin", "floorTokens", "capTokens",
  "isActive", "description", "createdAt", "updatedAt"
) VALUES
  (
    'aifc_lp_generate', 'LP_GENERATE', 'LP Generate (HTML)', 'claude-haiku-4-5',
    1.0, 5.0,
    2.0, 10, 0,
    true,
    'Generate landing page HTML dari brief. Streaming response. Charge berdasarkan input/output token real.',
    NOW(), NOW()
  ),
  (
    'aifc_lp_optimize', 'LP_OPTIMIZE', 'LP Optimize (CRO)', 'claude-sonnet-4-6',
    3.0, 15.0,
    2.0, 10, 0,
    true,
    'Optimasi CRO landing page pakai Claude Sonnet (model lebih besar). POWER tier only.',
    NOW(), NOW()
  ),
  (
    'aifc_soul_sim', 'SOUL_SIM', 'Soul Simulation', 'claude-haiku-4-5',
    1.0, 5.0,
    2.0, 10, 0,
    true,
    'Simulasi 2 AI (seller vs buyer) untuk test prompt. Multi-provider — pricing snapshot per-turn dari AiModel.',
    NOW(), NOW()
  ),
  (
    'aifc_cs_reply', 'CS_REPLY', 'CS Reply WhatsApp', 'claude-haiku-4-5',
    1.0, 5.0,
    2.0, 10, 0,
    true,
    'Auto-balas chat customer di WhatsApp via AI. Charge proporsional input+output token real per balasan (bukan flat per-message).',
    NOW(), NOW()
  )
ON CONFLICT ("featureKey") DO UPDATE SET
  "platformMargin" = EXCLUDED."platformMargin",
  "floorTokens" = EXCLUDED."floorTokens",
  "capTokens" = EXCLUDED."capTokens",
  "updatedAt" = NOW();
