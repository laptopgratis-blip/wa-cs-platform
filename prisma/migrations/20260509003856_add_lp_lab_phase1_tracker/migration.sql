-- AlterTable
ALTER TABLE "LpVisit" ADD COLUMN     "bounced" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "browser" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "ctaClicked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "deviceType" TEXT,
ADD COLUMN     "lastEventAt" TIMESTAMP(3),
ADD COLUMN     "os" TEXT,
ADD COLUMN     "scrollMaxPct" INTEGER,
ADD COLUMN     "timeOnPageSec" INTEGER,
ADD COLUMN     "utmCampaign" TEXT,
ADD COLUMN     "utmMedium" TEXT,
ADD COLUMN     "utmSource" TEXT;

-- CreateTable
CREATE TABLE "LpEvent" (
    "id" TEXT NOT NULL,
    "landingPageId" TEXT NOT NULL,
    "visitId" TEXT,
    "eventType" TEXT NOT NULL,
    "eventValue" TEXT,
    "scrollPct" INTEGER,
    "timeOnPageSec" INTEGER,
    "ipHash" TEXT NOT NULL,
    "deviceType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LpEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LpEvent_landingPageId_eventType_createdAt_idx" ON "LpEvent"("landingPageId", "eventType", "createdAt");

-- CreateIndex
CREATE INDEX "LpEvent_landingPageId_createdAt_idx" ON "LpEvent"("landingPageId", "createdAt");

-- CreateIndex
CREATE INDEX "LpEvent_visitId_idx" ON "LpEvent"("visitId");

-- CreateIndex
CREATE INDEX "LpVisit_landingPageId_deviceType_idx" ON "LpVisit"("landingPageId", "deviceType");

-- AddForeignKey
ALTER TABLE "LpEvent" ADD CONSTRAINT "LpEvent_landingPageId_fkey" FOREIGN KEY ("landingPageId") REFERENCES "LandingPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LpEvent" ADD CONSTRAINT "LpEvent_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "LpVisit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

