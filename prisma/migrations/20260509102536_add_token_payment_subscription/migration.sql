-- Token-based subscription payment.
-- Tambah kolom tokenAmount di SubscriptionInvoice supaya bisa audit berapa
-- token dipotong saat user bayar subscription dengan saldo token.
-- paymentMethod tetap field string (existing) — value baru "TOKEN_BALANCE"
-- dipakai sejak migrasi ini.

ALTER TABLE "SubscriptionInvoice"
  ADD COLUMN IF NOT EXISTS "tokenAmount" INTEGER;
