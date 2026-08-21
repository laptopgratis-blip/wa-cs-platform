-- Sesuaikan harga Kredit Pesan dengan dokumen pricing owner (2026-08-21):
--   Marketing      Rp657/pesan (dasar Meta Rp586,33 — markup ±12,05%)
--   Utility        Rp393/pesan (dasar Meta Rp356,65 — markup ±10,19%)
--   Authentication Rp393/pesan (disamakan dengan Utility sesuai dokumen)
-- Kolom metaUsd di-rename ke metaRp: dokumen & rate card bekerja dalam Rupiah.

ALTER TABLE "MessageCreditRate" RENAME COLUMN "metaUsd" TO "metaRp";

UPDATE "MessageCreditRate" SET "priceRp" = 657, "metaRp" = 586.33, "updatedAt" = CURRENT_TIMESTAMP
WHERE "category" = 'MARKETING';
UPDATE "MessageCreditRate" SET "priceRp" = 393, "metaRp" = 356.65, "updatedAt" = CURRENT_TIMESTAMP
WHERE "category" = 'UTILITY';
UPDATE "MessageCreditRate" SET "priceRp" = 393, "metaRp" = 356.65, "updatedAt" = CURRENT_TIMESTAMP
WHERE "category" = 'AUTHENTICATION';

-- DB baru (prod bootstrap): seed M1 hanya INSERT bila kategori belum ada —
-- pastikan ketiga baris ada dengan harga dokumen.
INSERT INTO "MessageCreditRate" ("id", "category", "priceRp", "metaRp", "updatedAt") VALUES
  ('mcr_marketing', 'MARKETING', 657, 586.33, CURRENT_TIMESTAMP),
  ('mcr_utility', 'UTILITY', 393, 356.65, CURRENT_TIMESTAMP),
  ('mcr_authentication', 'AUTHENTICATION', 393, 356.65, CURRENT_TIMESTAMP)
ON CONFLICT ("category") DO NOTHING;
