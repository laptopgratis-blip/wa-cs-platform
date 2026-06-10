-- Panggung Bersama (shared live stage): antrian pertanyaan global + state
-- "sedang tayang" server-authoritative supaya semua device menonton host
-- menjawab pertanyaan yang sama secara antre.

-- CreateEnum
CREATE TYPE "LiveQueueStatus" AS ENUM ('PENDING', 'ANSWERING', 'DONE', 'DROPPED');

-- AlterTable (semua nullable / default → aman untuk room yang sudah ada)
ALTER TABLE "LiveRoom" ADD COLUMN "currentPerformance" JSONB,
ADD COLUMN "performanceSeq" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "stageLockedUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "LiveQueueItem" (
    "id" TEXT NOT NULL,
    "liveRoomId" TEXT NOT NULL,
    "liveSessionId" TEXT,
    "askerName" TEXT,
    "isBot" BOOLEAN NOT NULL DEFAULT false,
    "questionText" TEXT NOT NULL,
    "status" "LiveQueueStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answeredAt" TIMESTAMP(3),

    CONSTRAINT "LiveQueueItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LiveQueueItem_liveRoomId_status_createdAt_idx" ON "LiveQueueItem"("liveRoomId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "LiveQueueItem" ADD CONSTRAINT "LiveQueueItem_liveRoomId_fkey" FOREIGN KEY ("liveRoomId") REFERENCES "LiveRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
