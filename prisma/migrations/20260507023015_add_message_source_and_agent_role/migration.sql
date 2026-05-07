-- AlterEnum: tambah AGENT untuk balasan CS manusia (web atau WA HP).
-- HUMAN dipertahankan supaya pesan lama tetap kebaca.
ALTER TYPE "MessageRole" ADD VALUE IF NOT EXISTS 'AGENT';

-- AlterTable: tambah field source + externalMsgId di Message.
-- source = 'WA_DIRECT' | 'WEB_DASHBOARD' | 'AI' | NULL (legacy/customer).
-- externalMsgId = msg.key.id dari Baileys, untuk dedup pesan outgoing.
ALTER TABLE "Message"
  ADD COLUMN IF NOT EXISTS "source" TEXT,
  ADD COLUMN IF NOT EXISTS "externalMsgId" TEXT;

-- CreateIndex: percepat lookup dedup berdasarkan externalMsgId.
CREATE INDEX IF NOT EXISTS "Message_externalMsgId_idx" ON "Message"("externalMsgId");
