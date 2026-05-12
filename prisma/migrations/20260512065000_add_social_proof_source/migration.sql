-- Tambah kolom socialProofSource untuk pilihan source data popup social proof.
-- Default 'PAID' = behavior lama (hanya order paymentStatus=PAID).
-- 'ALL' = semua status order (PENDING + PAID + CANCELLED) — opsi untuk form baru
-- yang belum punya banyak pembeli paid.
ALTER TABLE "OrderForm"
  ADD COLUMN "socialProofSource" TEXT NOT NULL DEFAULT 'PAID';
