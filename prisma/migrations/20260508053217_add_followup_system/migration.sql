-- CreateTable
CREATE TABLE "FollowUpTemplate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "paymentMethod" TEXT,
    "applyOnPaymentStatus" TEXT,
    "applyOnDeliveryStatus" TEXT,
    "delayDays" INTEGER NOT NULL DEFAULT 0,
    "name" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT NOT NULL DEFAULT 'GLOBAL',
    "orderFormId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FollowUpTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FollowUpQueue" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "failedReason" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "resolvedMessage" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "triggerEvent" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FollowUpQueue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FollowUpLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "templateId" TEXT,
    "queueId" TEXT,
    "customerPhone" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "source" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FollowUpLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FollowUpBlacklist" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "reason" TEXT,
    "blockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FollowUpBlacklist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FollowUpTemplate_userId_trigger_isActive_idx" ON "FollowUpTemplate"("userId", "trigger", "isActive");

-- CreateIndex
CREATE INDEX "FollowUpQueue_scheduledAt_status_idx" ON "FollowUpQueue"("scheduledAt", "status");

-- CreateIndex
CREATE INDEX "FollowUpQueue_orderId_status_idx" ON "FollowUpQueue"("orderId", "status");

-- CreateIndex
CREATE INDEX "FollowUpQueue_userId_status_idx" ON "FollowUpQueue"("userId", "status");

-- CreateIndex
CREATE INDEX "FollowUpLog_orderId_sentAt_idx" ON "FollowUpLog"("orderId", "sentAt" DESC);

-- CreateIndex
CREATE INDEX "FollowUpLog_userId_sentAt_idx" ON "FollowUpLog"("userId", "sentAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "FollowUpBlacklist_userId_customerPhone_key" ON "FollowUpBlacklist"("userId", "customerPhone");

-- AddForeignKey
ALTER TABLE "FollowUpTemplate" ADD CONSTRAINT "FollowUpTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUpQueue" ADD CONSTRAINT "FollowUpQueue_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "UserOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUpQueue" ADD CONSTRAINT "FollowUpQueue_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "FollowUpTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUpQueue" ADD CONSTRAINT "FollowUpQueue_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUpBlacklist" ADD CONSTRAINT "FollowUpBlacklist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
