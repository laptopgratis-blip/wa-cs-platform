-- CreateTable
CREATE TABLE "LpScore" (
    "id" TEXT NOT NULL,
    "landingPageId" TEXT NOT NULL,
    "total" INTEGER NOT NULL,
    "breakdownJson" JSONB NOT NULL DEFAULT '{}',
    "periodDays" INTEGER NOT NULL DEFAULT 30,
    "sampleVisits" INTEGER NOT NULL DEFAULT 0,
    "trigger" TEXT NOT NULL DEFAULT 'cron',
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LpScore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LpScore_landingPageId_computedAt_idx" ON "LpScore"("landingPageId", "computedAt" DESC);

-- AddForeignKey
ALTER TABLE "LpScore" ADD CONSTRAINT "LpScore_landingPageId_fkey" FOREIGN KEY ("landingPageId") REFERENCES "LandingPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

