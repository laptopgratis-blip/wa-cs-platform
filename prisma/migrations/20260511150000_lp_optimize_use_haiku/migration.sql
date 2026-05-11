-- LP_OPTIMIZE: revert ke Haiku 4.5
--
-- Migration sebelumnya (20260511120000_fair_pricing_unified) seed
-- LP_OPTIMIZE pakai Sonnet 4.6 ($3/$15) karena anggap "model lebih besar
-- = quality lebih baik untuk CRO". Setelah deploy ternyata Sonnet
-- 3-5x lebih lambat dari Haiku (50-100 tok/s vs 200-300 tok/s) +
-- 3x lebih mahal. Output LP optimize biasanya 15-30K token, jadi:
--   - Haiku 4.5: ~60-150 detik (acceptable)
--   - Sonnet 4.6: ~300-600 detik (5-10 menit — UX buruk, "ngga gerak")
-- Quality drop dari Sonnet → Haiku kecil untuk HTML rewrite + saran CRO
-- text-based. Revert ke Haiku.

UPDATE "AiFeatureConfig"
SET "modelName" = 'claude-haiku-4-5',
    "inputPricePer1M" = 1.0,
    "outputPricePer1M" = 5.0,
    "description" = 'Optimasi CRO landing page. Pakai Haiku (cepat 200-300 tok/s, cukup buat HTML rewrite & saran CRO). Switch ke Sonnet hanya kalau perlu reasoning lebih dalam — tapi 3-5x lebih lambat.',
    "updatedAt" = NOW()
WHERE "featureKey" = 'LP_OPTIMIZE';
