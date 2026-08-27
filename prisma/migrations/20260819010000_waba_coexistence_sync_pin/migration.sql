-- CreateEnum
CREATE TYPE "CoexSyncStatus" AS ENUM ('REQUESTED', 'IN_PROGRESS', 'DONE', 'DECLINED', 'SKIPPED', 'ERROR');

-- DropIndex
DROP INDEX "Message_externalMsgId_idx";

-- AlterTable
ALTER TABLE "WhatsappSession" ADD COLUMN     "coexContactSyncStatus" "CoexSyncStatus",
ADD COLUMN     "coexContactsImported" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "coexHistorySyncProgress" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "coexHistorySyncStatus" "CoexSyncStatus",
ADD COLUMN     "coexMessagesImported" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "coexSyncError" TEXT,
ADD COLUMN     "coexSyncRequestedAt" TIMESTAMP(3),
ADD COLUMN     "isCoexistence" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "wabaPinEnc" TEXT,
ADD COLUMN     "wabaPinGenerated" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "Message_externalMsgId_key" ON "Message"("externalMsgId");

