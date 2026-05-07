-- AlterTable
ALTER TABLE "UserQuota" ADD COLUMN     "canAiGenerate" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "maxImageSizeMB" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "maxVisitorMonth" INTEGER NOT NULL DEFAULT 1000;

-- CreateTable
CREATE TABLE "LpVisit" (
    "id" TEXT NOT NULL,
    "landingPageId" TEXT NOT NULL,
    "ipHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "referer" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LpVisit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LpVisit_landingPageId_createdAt_idx" ON "LpVisit"("landingPageId", "createdAt");

-- CreateIndex
CREATE INDEX "LpVisit_ipHash_landingPageId_createdAt_idx" ON "LpVisit"("ipHash", "landingPageId", "createdAt");

-- AddForeignKey
ALTER TABLE "LpVisit" ADD CONSTRAINT "LpVisit_landingPageId_fkey" FOREIGN KEY ("landingPageId") REFERENCES "LandingPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

