-- AlterTable
ALTER TABLE "ContentPiece" ADD COLUMN "scheduledFor" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "ContentPiece_userId_scheduledFor_idx" ON "ContentPiece"("userId", "scheduledFor");
