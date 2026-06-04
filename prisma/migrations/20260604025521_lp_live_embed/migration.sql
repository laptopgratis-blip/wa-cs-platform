-- CreateEnum
CREATE TYPE "LpLiveGateMode" AS ENUM ('REQUIRED', 'OPTIONAL', 'HYBRID', 'OFF');

-- CreateTable
CREATE TABLE "LpLiveEmbed" (
    "id" TEXT NOT NULL,
    "landingPageId" TEXT NOT NULL,
    "liveRoomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gateMode" "LpLiveGateMode" NOT NULL DEFAULT 'HYBRID',
    "gateFields" JSONB NOT NULL DEFAULT '["name","phone"]',
    "gateTriggerSec" INTEGER NOT NULL DEFAULT 30,
    "gateTriggerOnChat" BOOLEAN NOT NULL DEFAULT true,
    "ctaLabel" TEXT NOT NULL DEFAULT 'Tanya host live',
    "position" TEXT NOT NULL DEFAULT 'inline',
    "autoplay" BOOLEAN NOT NULL DEFAULT true,
    "mutedDefault" BOOLEAN NOT NULL DEFAULT true,
    "widthPx" INTEGER NOT NULL DEFAULT 420,
    "heightPx" INTEGER NOT NULL DEFAULT 720,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LpLiveEmbed_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LpLiveEmbed_landingPageId_key" ON "LpLiveEmbed"("landingPageId");

-- CreateIndex
CREATE INDEX "LpLiveEmbed_liveRoomId_idx" ON "LpLiveEmbed"("liveRoomId");

-- CreateIndex
CREATE INDEX "LpLiveEmbed_userId_idx" ON "LpLiveEmbed"("userId");

-- AddForeignKey
ALTER TABLE "LpLiveEmbed" ADD CONSTRAINT "LpLiveEmbed_landingPageId_fkey" FOREIGN KEY ("landingPageId") REFERENCES "LandingPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LpLiveEmbed" ADD CONSTRAINT "LpLiveEmbed_liveRoomId_fkey" FOREIGN KEY ("liveRoomId") REFERENCES "LiveRoom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LpLiveEmbed" ADD CONSTRAINT "LpLiveEmbed_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
