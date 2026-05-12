-- Tambah pilihan sound notif untuk popup social proof.
ALTER TABLE "OrderForm"
  ADD COLUMN "socialProofSoundEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "socialProofSound" TEXT NOT NULL DEFAULT 'bell';
