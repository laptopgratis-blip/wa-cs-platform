-- CreateEnum
CREATE TYPE "LiveOutcome" AS ENUM ('OPEN', 'CLOSED_WON', 'CLOSED_LOST', 'DROPPED');

-- CreateEnum
CREATE TYPE "LiveEventType" AS ENUM ('SESSION_START', 'USER_MESSAGE', 'AI_MESSAGE', 'PRODUCT_CLICK', 'LEAD_CAPTURE', 'HANDOFF_WA', 'AI_INSUFFICIENT_BALANCE', 'AI_ERROR', 'SESSION_END');

-- CreateEnum
CREATE TYPE "LiveLeadStatus" AS ENUM ('NEW', 'HANDOFF_SENT', 'HANDOFF_FAILED', 'CLOSED_WON', 'CLOSED_LOST');

-- CreateTable
CREATE TABLE "LiveSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "liveRoomId" TEXT NOT NULL,
    "clientSessionId" TEXT NOT NULL,
    "fingerprint" TEXT,
    "customerName" TEXT,
    "customerPhone" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "outcome" "LiveOutcome" NOT NULL DEFAULT 'OPEN',
    "outcomeReason" TEXT,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "productClicks" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiveSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveEvent" (
    "id" TEXT NOT NULL,
    "liveSessionId" TEXT NOT NULL,
    "type" "LiveEventType" NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiveEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveLead" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "liveRoomId" TEXT NOT NULL,
    "liveSessionId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "productInterest" TEXT,
    "transcript" TEXT NOT NULL,
    "status" "LiveLeadStatus" NOT NULL DEFAULT 'NEW',
    "contactId" TEXT,
    "handoffError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiveLead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LiveSession_clientSessionId_key" ON "LiveSession"("clientSessionId");

-- CreateIndex
CREATE INDEX "LiveSession_userId_startedAt_idx" ON "LiveSession"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "LiveSession_liveRoomId_startedAt_idx" ON "LiveSession"("liveRoomId", "startedAt");

-- CreateIndex
CREATE INDEX "LiveSession_outcome_idx" ON "LiveSession"("outcome");

-- CreateIndex
CREATE INDEX "LiveEvent_liveSessionId_createdAt_idx" ON "LiveEvent"("liveSessionId", "createdAt");

-- CreateIndex
CREATE INDEX "LiveEvent_type_createdAt_idx" ON "LiveEvent"("type", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LiveLead_liveSessionId_key" ON "LiveLead"("liveSessionId");

-- CreateIndex
CREATE INDEX "LiveLead_userId_createdAt_idx" ON "LiveLead"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "LiveLead_liveRoomId_createdAt_idx" ON "LiveLead"("liveRoomId", "createdAt");

-- CreateIndex
CREATE INDEX "LiveLead_status_idx" ON "LiveLead"("status");

-- AddForeignKey
ALTER TABLE "LiveSession" ADD CONSTRAINT "LiveSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveSession" ADD CONSTRAINT "LiveSession_liveRoomId_fkey" FOREIGN KEY ("liveRoomId") REFERENCES "LiveRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveEvent" ADD CONSTRAINT "LiveEvent_liveSessionId_fkey" FOREIGN KEY ("liveSessionId") REFERENCES "LiveSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveLead" ADD CONSTRAINT "LiveLead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveLead" ADD CONSTRAINT "LiveLead_liveRoomId_fkey" FOREIGN KEY ("liveRoomId") REFERENCES "LiveRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveLead" ADD CONSTRAINT "LiveLead_liveSessionId_fkey" FOREIGN KEY ("liveSessionId") REFERENCES "LiveSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
