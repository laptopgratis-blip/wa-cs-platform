-- "Kirim dari" per template follow-up (2026-11-25).
-- Seller memilih nomor WA yang SELALU dipakai mengirim follow-up ini. Mode
-- KETAT: nomor offline → kiriman ditunda (dicoba ulang), tidak pindah ke
-- nomor lain. NULL = perilaku lama (CS WhatsApp produk → nomor terakhir
-- kontak → urutan kandidat). Tanpa backfill.
-- ON DELETE SET NULL hanya pengaman DELETE baris sesi; "hapus nomor" di
-- /whatsapp adalah soft-delete (isActive=false) dan ditangani resolver
-- (lib/services/followup-template-sender.ts).

ALTER TABLE "FollowUpTemplate" ADD COLUMN "senderSessionId" TEXT;

CREATE INDEX "FollowUpTemplate_senderSessionId_idx" ON "FollowUpTemplate"("senderSessionId");

ALTER TABLE "FollowUpTemplate" ADD CONSTRAINT "FollowUpTemplate_senderSessionId_fkey" FOREIGN KEY ("senderSessionId") REFERENCES "WhatsappSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
