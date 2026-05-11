-- Backfill AiGenerationLog dengan data historis dari tabel asli yang belum
-- pernah masuk: LpGeneration, LpOptimization, SoulSimulation, dan Message
-- (CS Reply AI). Option A: hanya ISI GAP — tidak mengubah row existing.
--
-- Idempotent: dijaga via pricingSnapshot.backfill_batch = 'fair-pricing-v1'.
-- Re-run aman; row yg sudah ter-backfill di-skip.
--
-- Cara pakai (di kontainer Postgres atau host):
--   cat scripts/backfill-ai-generation-log.sql | \
--     docker exec -i hulao-postgres psql -U hulao -d hulao
--
-- Output: counter per table di-RAISE NOTICE.

DO $$
DECLARE
  v_pricePerToken numeric;
  v_usdRate numeric;
  v_lpgen_inserted bigint;
  v_lpopt_inserted bigint;
  v_csreply_inserted bigint;
  v_soulsim_inserted bigint;
BEGIN
  -- Snapshot rate saat backfill — untuk row historis yg apiCostRp = 0
  -- (defensif: hitung dari token kalau provider cost belum ter-record).
  SELECT "pricePerToken", "usdRate"
    INTO v_pricePerToken, v_usdRate
    FROM "PricingSettings" LIMIT 1;
  v_pricePerToken := COALESCE(v_pricePerToken, 2);
  v_usdRate := COALESCE(v_usdRate, 16000);

  RAISE NOTICE 'Backfill start. pricePerToken=%, usdRate=%', v_pricePerToken, v_usdRate;

  -- ─── LP_GENERATE ────────────────────────────────────────────────────────
  -- Sumber: LpGeneration. tokensCharged historis = 10 (flat lama).
  INSERT INTO "AiGenerationLog" (
    id, "featureKey", "userId", "subjectType", "subjectId",
    "inputTokens", "outputTokens",
    "apiCostUsd", "apiCostRp", "tokensCharged",
    "revenueRp", "profitRp", "marginPct",
    "modelName", "pricingSnapshot", status, "createdAt"
  )
  SELECT
    'bf_lpgen_' || lg.id,
    'LP_GENERATE', lg."userId", 'LP', lg."lpId",
    lg."inputTokens", lg."outputTokens",
    lg."providerCostUsd", lg."providerCostRp", lg."platformTokensCharged",
    lg."platformTokensCharged" * v_pricePerToken,
    (lg."platformTokensCharged" * v_pricePerToken) - lg."providerCostRp",
    CASE
      WHEN lg."platformTokensCharged" > 0
      THEN (((lg."platformTokensCharged" * v_pricePerToken) - lg."providerCostRp") / NULLIF(lg."platformTokensCharged" * v_pricePerToken, 0)) * 100
      ELSE 0
    END,
    lg.model,
    jsonb_build_object(
      'inputPricePer1M', lg."inputPricePer1MUsd",
      'outputPricePer1M', lg."outputPricePer1MUsd",
      'platformMargin', 1.3,
      'floorTokens', 10,
      'capTokens', 0,
      'usdRate', v_usdRate,
      'pricePerToken', v_pricePerToken,
      'backfill_batch', 'fair-pricing-v1',
      'source_table', 'LpGeneration'
    ),
    'OK', lg."createdAt"
  FROM "LpGeneration" lg
  WHERE NOT EXISTS (
    SELECT 1 FROM "AiGenerationLog" agl WHERE agl.id = 'bf_lpgen_' || lg.id
  );
  GET DIAGNOSTICS v_lpgen_inserted = ROW_COUNT;
  RAISE NOTICE '  LP_GENERATE: % rows inserted', v_lpgen_inserted;

  -- ─── LP_OPTIMIZE ────────────────────────────────────────────────────────
  INSERT INTO "AiGenerationLog" (
    id, "featureKey", "userId", "subjectType", "subjectId",
    "inputTokens", "outputTokens",
    "apiCostUsd", "apiCostRp", "tokensCharged",
    "revenueRp", "profitRp", "marginPct",
    "modelName", "pricingSnapshot", status, "errorMessage", "createdAt"
  )
  SELECT
    'bf_lpopt_' || lo.id,
    'LP_OPTIMIZE', lo."userId", 'LP', lo."lpId",
    lo."inputTokens", lo."outputTokens",
    lo."providerCostUsd", lo."providerCostRp", lo."platformTokensCharged",
    lo."platformTokensCharged" * v_pricePerToken,
    (lo."platformTokensCharged" * v_pricePerToken) - lo."providerCostRp",
    CASE
      WHEN lo."platformTokensCharged" > 0
      THEN (((lo."platformTokensCharged" * v_pricePerToken) - lo."providerCostRp") / NULLIF(lo."platformTokensCharged" * v_pricePerToken, 0)) * 100
      ELSE 0
    END,
    lo.model,
    jsonb_build_object(
      'inputPricePer1M', lo."inputPricePer1MUsd",
      'outputPricePer1M', lo."outputPricePer1MUsd",
      'platformMargin', 1.3,
      'floorTokens', 100,
      'capTokens', 0,
      'usdRate', v_usdRate,
      'pricePerToken', v_pricePerToken,
      'backfill_batch', 'fair-pricing-v1',
      'source_table', 'LpOptimization'
    ),
    CASE WHEN lo."errorMessage" IS NULL THEN 'OK' ELSE 'FAILED' END,
    lo."errorMessage",
    lo."createdAt"
  FROM "LpOptimization" lo
  WHERE NOT EXISTS (
    SELECT 1 FROM "AiGenerationLog" agl WHERE agl.id = 'bf_lpopt_' || lo.id
  );
  GET DIAGNOSTICS v_lpopt_inserted = ROW_COUNT;
  RAISE NOTICE '  LP_OPTIMIZE: % rows inserted', v_lpopt_inserted;

  -- ─── CS_REPLY ───────────────────────────────────────────────────────────
  -- Sumber: Message (role='AI'). modelName diambil dari AiModel via
  -- WhatsappSession.modelId. tokensCharged historis = costPerMessage flat.
  INSERT INTO "AiGenerationLog" (
    id, "featureKey", "userId", "subjectType", "subjectId",
    "inputTokens", "outputTokens",
    "apiCostUsd", "apiCostRp", "tokensCharged",
    "revenueRp", "profitRp", "marginPct",
    "modelName", "pricingSnapshot", status, "createdAt"
  )
  SELECT
    'bf_csreply_' || m.id,
    'CS_REPLY', wa."userId", 'WA_SESSION', wa.id,
    COALESCE(m."apiInputTokens", 0),
    COALESCE(m."apiOutputTokens", 0),
    COALESCE(m."apiCostRp", 0) / NULLIF(v_usdRate, 0),
    COALESCE(m."apiCostRp", 0),
    COALESCE(m."tokensCharged", 0),
    COALESCE(m."revenueRp", 0),
    COALESCE(m."profitRp", 0),
    CASE
      WHEN COALESCE(m."revenueRp", 0) > 0
      THEN (COALESCE(m."profitRp", 0) / m."revenueRp") * 100
      ELSE 0
    END,
    COALESCE(am."modelId", 'unknown'),
    jsonb_build_object(
      'inputPricePer1M', COALESCE(am."inputPricePer1M", 0),
      'outputPricePer1M', COALESCE(am."outputPricePer1M", 0),
      'platformMargin', 1.0,
      'floorTokens', 1,
      'capTokens', 0,
      'usdRate', v_usdRate,
      'pricePerToken', v_pricePerToken,
      'backfill_batch', 'fair-pricing-v1',
      'source_table', 'Message'
    ),
    'OK', m."createdAt"
  FROM "Message" m
  JOIN "WhatsappSession" wa ON wa.id = m."waSessionId"
  LEFT JOIN "AiModel" am ON am.id = wa."modelId"
  WHERE m.role = 'AI'
    AND m."apiCostRp" IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM "AiGenerationLog" agl WHERE agl.id = 'bf_csreply_' || m.id
    );
  GET DIAGNOSTICS v_csreply_inserted = ROW_COUNT;
  RAISE NOTICE '  CS_REPLY: % rows inserted', v_csreply_inserted;

  -- ─── SOUL_SIM ───────────────────────────────────────────────────────────
  -- Sumber: SoulSimulation. Aggregate per simulation (1 row backfill = 1 sim).
  -- tokensCharged historis = ceil(totalCostRp / pricePerToken) tanpa margin.
  INSERT INTO "AiGenerationLog" (
    id, "featureKey", "userId", "subjectType", "subjectId",
    "inputTokens", "outputTokens",
    "apiCostUsd", "apiCostRp", "tokensCharged",
    "revenueRp", "profitRp", "marginPct",
    "modelName", "pricingSnapshot", status, "errorMessage", "createdAt"
  )
  SELECT
    'bf_soulsim_' || ss.id,
    'SOUL_SIM', ss."triggeredBy", 'SOUL_SIM', ss.id,
    ss."totalInputTokens", ss."totalOutputTokens",
    ss."totalCostRp" / NULLIF(v_usdRate, 0),
    ss."totalCostRp",
    GREATEST(1, CEIL(ss."totalCostRp" / NULLIF(v_pricePerToken, 0)))::int,
    GREATEST(1, CEIL(ss."totalCostRp" / NULLIF(v_pricePerToken, 0)))::int * v_pricePerToken,
    (GREATEST(1, CEIL(ss."totalCostRp" / NULLIF(v_pricePerToken, 0)))::int * v_pricePerToken) - ss."totalCostRp",
    CASE
      WHEN ss."totalCostRp" > 0
      THEN (((GREATEST(1, CEIL(ss."totalCostRp" / NULLIF(v_pricePerToken, 0)))::int * v_pricePerToken) - ss."totalCostRp")
            / NULLIF(GREATEST(1, CEIL(ss."totalCostRp" / NULLIF(v_pricePerToken, 0)))::int * v_pricePerToken, 0)) * 100
      ELSE 0
    END,
    COALESCE(sm."modelId", 'multi-provider'),
    jsonb_build_object(
      'inputPricePer1M', COALESCE(sm."inputPricePer1M", 0),
      'outputPricePer1M', COALESCE(sm."outputPricePer1M", 0),
      'platformMargin', 1.0,
      'floorTokens', 1,
      'capTokens', 0,
      'usdRate', v_usdRate,
      'pricePerToken', v_pricePerToken,
      'backfill_batch', 'fair-pricing-v1',
      'source_table', 'SoulSimulation'
    ),
    CASE WHEN ss.status = 'COMPLETED' THEN 'OK' WHEN ss.status = 'FAILED' THEN 'FAILED' ELSE 'OK' END,
    ss."errorMessage",
    ss."createdAt"
  FROM "SoulSimulation" ss
  LEFT JOIN "AiModel" sm ON sm.id = ss."sellerModelId"
  WHERE NOT EXISTS (
    SELECT 1 FROM "AiGenerationLog" agl WHERE agl.id = 'bf_soulsim_' || ss.id
  );
  GET DIAGNOSTICS v_soulsim_inserted = ROW_COUNT;
  RAISE NOTICE '  SOUL_SIM: % rows inserted', v_soulsim_inserted;

  RAISE NOTICE 'Backfill done. Total: % rows',
    v_lpgen_inserted + v_lpopt_inserted + v_csreply_inserted + v_soulsim_inserted;
END $$;
