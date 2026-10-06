-- LP Lab: optimasi AI jadi background job + polling (2026-10-06).
-- Route tidak lagi menunggu AI (Cloudflare memutus di 100 dtk) — baris dibuat
-- RUNNING lalu job mengisi hasil dan menandai DONE/FAILED.

ALTER TABLE "LpOptimization"
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'DONE',
  ADD COLUMN "finishedAt" TIMESTAMP(3);

-- Backfill 1: pre-record yatim dari alur sinkron lama — request diputus proxy
-- / server restart sebelum hasil tersimpan. Bukan saran rule-based (memang
-- tanpa HTML). Jendela 30 menit supaya request lama yang mungkin masih jalan
-- saat deploy tidak ikut ditandai gagal.
UPDATE "LpOptimization"
SET "status" = 'FAILED',
    "errorMessage" = COALESCE(
      "errorMessage",
      'Proses optimasi terhenti sebelum selesai (server restart/timeout). Silakan jalankan ulang.'
    )
WHERE "model" <> 'rule-based-live-bridge'
  AND "afterHtml" IS NULL
  AND "applied" = false
  AND "createdAt" < NOW() - INTERVAL '30 minutes';

-- Backfill 2: kegagalan AI yang tercatat di alur lama (errorMessage terisi,
-- tanpa hasil HTML).
UPDATE "LpOptimization"
SET "status" = 'FAILED'
WHERE "errorMessage" IS NOT NULL
  AND "afterHtml" IS NULL
  AND "status" <> 'FAILED';

-- Baris lama: waktu selesai tidak tercatat — pakai createdAt sebagai pendekatan.
UPDATE "LpOptimization"
SET "finishedAt" = "createdAt"
WHERE "finishedAt" IS NULL;

CREATE INDEX "LpOptimization_lpId_status_idx" ON "LpOptimization"("lpId", "status");
