-- CS WhatsApp per produk (2026-10-12).
-- Seller memilih nomor WA CS di form produk. Order yang berisi produk itu:
-- pesan otomatis ke pelanggan dikirim DARI nomor CS produk, dan pelanggan
-- diarahkan KE nomor itu (tombol WhatsApp di invoice + {wa_admin} follow-up).
-- NULL = ikuti nomor utama (perilaku lama) — tanpa backfill, semua produk lama
-- tetap seperti sebelumnya. Tidak ada kolom baru di "UserOrder": CS diturunkan
-- live dari UserOrder.items[].productId.
-- Sesi dihapus → kolom kembali NULL (ON DELETE SET NULL), produk tetap utuh.

ALTER TABLE "Product" ADD COLUMN "csSessionId" TEXT;

CREATE INDEX "Product_csSessionId_idx" ON "Product"("csSessionId");

ALTER TABLE "Product" ADD CONSTRAINT "Product_csSessionId_fkey" FOREIGN KEY ("csSessionId") REFERENCES "WhatsappSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
