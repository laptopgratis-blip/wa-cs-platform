-- Follow-Up: nurture lead Live "belum order"
-- FollowUpQueue / FollowUpLog jadi bisa berbasis LiveLead (selain UserOrder).
-- Semua perubahan aditif/nullable → aman untuk baris yang sudah ada.

-- AlterTable: orderId nullable + liveLeadId baru
ALTER TABLE "FollowUpQueue" ALTER COLUMN "orderId" DROP NOT NULL;
ALTER TABLE "FollowUpQueue" ADD COLUMN "liveLeadId" TEXT;

-- AlterTable: log juga boleh tanpa order (lead-based) + liveLeadId
ALTER TABLE "FollowUpLog" ALTER COLUMN "orderId" DROP NOT NULL;
ALTER TABLE "FollowUpLog" ADD COLUMN "liveLeadId" TEXT;

-- CreateIndex
CREATE INDEX "FollowUpQueue_liveLeadId_status_idx" ON "FollowUpQueue"("liveLeadId", "status");

-- AddForeignKey
ALTER TABLE "FollowUpQueue" ADD CONSTRAINT "FollowUpQueue_liveLeadId_fkey" FOREIGN KEY ("liveLeadId") REFERENCES "LiveLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
