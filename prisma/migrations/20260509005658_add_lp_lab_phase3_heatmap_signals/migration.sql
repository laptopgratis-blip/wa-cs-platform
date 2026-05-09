-- CreateTable
CREATE TABLE "LpHeatmapBin" (
    "id" TEXT NOT NULL,
    "landingPageId" TEXT NOT NULL,
    "deviceType" TEXT NOT NULL,
    "xCell" INTEGER NOT NULL,
    "yCell" INTEGER NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LpHeatmapBin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LpChatSignal" (
    "id" TEXT NOT NULL,
    "landingPageId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "sampleQuotes" JSONB NOT NULL DEFAULT '[]',
    "periodDays" INTEGER NOT NULL DEFAULT 30,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LpChatSignal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LpHeatmapBin_landingPageId_deviceType_idx" ON "LpHeatmapBin"("landingPageId", "deviceType");

-- CreateIndex
CREATE UNIQUE INDEX "LpHeatmapBin_landingPageId_deviceType_xCell_yCell_key" ON "LpHeatmapBin"("landingPageId", "deviceType", "xCell", "yCell");

-- CreateIndex
CREATE INDEX "LpChatSignal_landingPageId_idx" ON "LpChatSignal"("landingPageId");

-- CreateIndex
CREATE UNIQUE INDEX "LpChatSignal_landingPageId_category_periodDays_key" ON "LpChatSignal"("landingPageId", "category", "periodDays");

-- AddForeignKey
ALTER TABLE "LpHeatmapBin" ADD CONSTRAINT "LpHeatmapBin_landingPageId_fkey" FOREIGN KEY ("landingPageId") REFERENCES "LandingPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LpChatSignal" ADD CONSTRAINT "LpChatSignal_landingPageId_fkey" FOREIGN KEY ("landingPageId") REFERENCES "LandingPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

