-- Repricing TokenPackage 2026-05-14
-- Goal: Ganti paket lama (Starter/Popular/Power) dengan paket baru yang
-- nama-nya tidak bentrok dengan LpUpgradePackage (Saldo Mini / Sedang / Besar).
-- Decoy pricing — paket Sedang (Rp 390rb/130rb token) sengaja diposisikan
-- supaya marginal cost ke Besar terasa super murah (+Rp 110rb dapat +120rb token).
--
-- Catatan keamanan:
--   • Paket lama HANYA di-set isActive=false (soft deactivate).
--     Tidak DELETE supaya FK ManualPayment.packageId historis tetap valid.
--   • Saldo user (TokenBalance) TIDAK di-touch — tetap aman.
--   • TokenTransaction history TIDAK di-touch — reference paket lama tetap valid.

-- 1) Soft deactivate semua TokenPackage aktif yang lama.
UPDATE "TokenPackage" SET "isActive" = false WHERE "isActive" = true;

-- 2) Insert 3 paket baru.
INSERT INTO "TokenPackage" ("id", "name", "tokenAmount", "price", "isPopular", "isActive", "sortOrder", "createdAt") VALUES
  ('pkg_saldo_mini_2026',   'Saldo Mini',   25000,  100000, false, true, 1, NOW()),
  ('pkg_saldo_sedang_2026', 'Saldo Sedang', 130000, 390000, false, true, 2, NOW()),
  ('pkg_saldo_besar_2026',  'Saldo Besar',  250000, 500000, true,  true, 3, NOW());
