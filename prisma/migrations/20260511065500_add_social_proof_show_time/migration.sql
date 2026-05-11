-- Tambah toggle untuk tampilkan timestamp pembelian di Social Proof popup.
-- Default true: preserve behavior existing. User yang last order-nya udah lama
-- bisa OFF supaya popup tidak counter-productive untuk konversi.
ALTER TABLE "OrderForm"
  ADD COLUMN "socialProofShowTime" BOOLEAN NOT NULL DEFAULT true;
