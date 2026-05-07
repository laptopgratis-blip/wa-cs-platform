-- AlterTable
ALTER TABLE "OrderForm" ADD COLUMN     "enabledPixelIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "UserOrder" ADD COLUMN     "fbclid" TEXT,
ADD COLUMN     "gclid" TEXT,
ADD COLUMN     "pixelLeadFiredAt" TIMESTAMP(3),
ADD COLUMN     "pixelPurchaseFiredAt" TIMESTAMP(3),
ADD COLUMN     "ttclid" TEXT,
ADD COLUMN     "utmCampaign" TEXT,
ADD COLUMN     "utmMedium" TEXT,
ADD COLUMN     "utmSource" TEXT;

-- CreateTable
CREATE TABLE "PixelIntegration" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "pixelId" TEXT NOT NULL,
    "serverSideEnabled" BOOLEAN NOT NULL DEFAULT false,
    "accessToken" TEXT,
    "conversionLabelInitiateCheckout" TEXT,
    "conversionLabelLead" TEXT,
    "conversionLabelPurchase" TEXT,
    "testEventCode" TEXT,
    "isTestMode" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "totalEvents" INTEGER NOT NULL DEFAULT 0,
    "lastEventAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PixelIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PixelEventLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pixelId" TEXT,
    "orderId" TEXT,
    "platform" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "responseStatus" INTEGER,
    "responseBody" TEXT,
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "succeeded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PixelEventLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PixelIntegration_userId_platform_idx" ON "PixelIntegration"("userId", "platform");

-- CreateIndex
CREATE INDEX "PixelIntegration_userId_isActive_idx" ON "PixelIntegration"("userId", "isActive");

-- CreateIndex
CREATE INDEX "PixelEventLog_orderId_idx" ON "PixelEventLog"("orderId");

-- CreateIndex
CREATE INDEX "PixelEventLog_userId_createdAt_idx" ON "PixelEventLog"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "PixelEventLog_eventId_idx" ON "PixelEventLog"("eventId");

-- CreateIndex
CREATE INDEX "PixelEventLog_succeeded_retryCount_idx" ON "PixelEventLog"("succeeded", "retryCount");

-- AddForeignKey
ALTER TABLE "PixelIntegration" ADD CONSTRAINT "PixelIntegration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PixelEventLog" ADD CONSTRAINT "PixelEventLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PixelEventLog" ADD CONSTRAINT "PixelEventLog_pixelId_fkey" FOREIGN KEY ("pixelId") REFERENCES "PixelIntegration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PixelEventLog" ADD CONSTRAINT "PixelEventLog_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "UserOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

