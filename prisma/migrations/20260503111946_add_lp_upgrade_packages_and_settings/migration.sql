-- CreateEnum
CREATE TYPE "PaymentPurpose" AS ENUM ('TOKEN_PURCHASE', 'LP_UPGRADE');

-- DropForeignKey
ALTER TABLE "ManualPayment" DROP CONSTRAINT "ManualPayment_packageId_fkey";

-- AlterTable
ALTER TABLE "ManualPayment" ADD COLUMN     "lpPackageId" TEXT,
ADD COLUMN     "purpose" "PaymentPurpose" NOT NULL DEFAULT 'TOKEN_PURCHASE',
ALTER COLUMN "packageId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "lpPackageId" TEXT,
ADD COLUMN     "purpose" "PaymentPurpose" NOT NULL DEFAULT 'TOKEN_PURCHASE';

-- CreateTable
CREATE TABLE "LpUpgradePackage" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "tier" "LpTier" NOT NULL,
    "maxLp" INTEGER NOT NULL,
    "maxStorageMB" INTEGER NOT NULL,
    "price" INTEGER NOT NULL,
    "isPopular" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LpUpgradePackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteSettings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LpUpgradePackage_isActive_sortOrder_idx" ON "LpUpgradePackage"("isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "SiteSettings_key_key" ON "SiteSettings"("key");

-- CreateIndex
CREATE INDEX "ManualPayment_purpose_status_idx" ON "ManualPayment"("purpose", "status");

-- CreateIndex
CREATE INDEX "Payment_purpose_status_idx" ON "Payment"("purpose", "status");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_lpPackageId_fkey" FOREIGN KEY ("lpPackageId") REFERENCES "LpUpgradePackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualPayment" ADD CONSTRAINT "ManualPayment_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "TokenPackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualPayment" ADD CONSTRAINT "ManualPayment_lpPackageId_fkey" FOREIGN KEY ("lpPackageId") REFERENCES "LpUpgradePackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
