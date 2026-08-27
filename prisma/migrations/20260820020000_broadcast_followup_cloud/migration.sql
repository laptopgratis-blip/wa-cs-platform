-- CreateEnum
CREATE TYPE "BroadcastRecipientStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'SKIPPED');

-- AlterEnum
ALTER TYPE "BroadcastStatus" ADD VALUE 'PAUSED';

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "broadcastRecipientId" TEXT;

-- AlterTable
ALTER TABLE "Broadcast" ADD COLUMN     "category" "MetaTemplateCategory",
ADD COLUMN     "chargedCreditRp" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "estimatedCreditRp" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastBatchAt" TIMESTAMP(3),
ADD COLUMN     "pausedReason" TEXT,
ADD COLUMN     "provider" "WaProvider" NOT NULL DEFAULT 'BAILEYS',
ADD COLUMN     "templateId" TEXT,
ADD COLUMN     "templateParams" JSONB,
ADD COLUMN     "totalDelivered" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalRead" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalSkipped" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "FollowUpTemplate" ADD COLUMN     "metaParamMap" JSONB,
ADD COLUMN     "metaTemplateId" TEXT;

-- AlterTable
ALTER TABLE "FollowUpQueue" ADD COLUMN     "externalMsgId" TEXT,
ADD COLUMN     "resolvedParams" JSONB,
ADD COLUMN     "sentVia" TEXT,
ADD COLUMN     "waSessionId" TEXT;

-- CreateTable
CREATE TABLE "BroadcastRecipient" (
    "id" TEXT NOT NULL,
    "broadcastId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "name" TEXT,
    "status" "BroadcastRecipientStatus" NOT NULL DEFAULT 'PENDING',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "claimedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "externalMsgId" TEXT,
    "messageId" TEXT,
    "errorCode" INTEGER,
    "errorMessage" TEXT,
    "creditRp" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BroadcastRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BroadcastRecipient_broadcastId_status_idx" ON "BroadcastRecipient"("broadcastId", "status");

-- CreateIndex
CREATE INDEX "BroadcastRecipient_messageId_idx" ON "BroadcastRecipient"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "BroadcastRecipient_broadcastId_contactId_key" ON "BroadcastRecipient"("broadcastId", "contactId");

-- CreateIndex
CREATE UNIQUE INDEX "Message_broadcastRecipientId_key" ON "Message"("broadcastRecipientId");

-- CreateIndex
CREATE INDEX "Broadcast_status_scheduledAt_idx" ON "Broadcast"("status", "scheduledAt");

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_broadcastRecipientId_fkey" FOREIGN KEY ("broadcastRecipientId") REFERENCES "BroadcastRecipient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Broadcast" ADD CONSTRAINT "Broadcast_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "WabaTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BroadcastRecipient" ADD CONSTRAINT "BroadcastRecipient_broadcastId_fkey" FOREIGN KEY ("broadcastId") REFERENCES "Broadcast"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUpTemplate" ADD CONSTRAINT "FollowUpTemplate_metaTemplateId_fkey" FOREIGN KEY ("metaTemplateId") REFERENCES "WabaTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

