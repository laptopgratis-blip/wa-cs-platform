-- CreateEnum
CREATE TYPE "LmsTier" AS ENUM ('FREE', 'BASIC', 'PRO', 'UNLIMITED');

-- CreateTable
CREATE TABLE "LmsUpgradePackage" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "tier" "LmsTier" NOT NULL,
    "maxCourses" INTEGER NOT NULL,
    "maxLessonsPerCourse" INTEGER NOT NULL,
    "maxStudentsPerCourse" INTEGER NOT NULL,
    "maxFileStorageMB" INTEGER NOT NULL DEFAULT 0,
    "canUseDripSchedule" BOOLEAN NOT NULL DEFAULT false,
    "canIssueCertificate" BOOLEAN NOT NULL DEFAULT false,
    "priceMonthly" INTEGER NOT NULL DEFAULT 0,
    "isPopular" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LmsUpgradePackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LmsQuota" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tier" "LmsTier" NOT NULL DEFAULT 'FREE',
    "maxCourses" INTEGER NOT NULL DEFAULT 1,
    "maxLessonsPerCourse" INTEGER NOT NULL DEFAULT 5,
    "maxStudentsPerCourse" INTEGER NOT NULL DEFAULT 50,
    "maxFileStorageMB" INTEGER NOT NULL DEFAULT 0,
    "canUseDripSchedule" BOOLEAN NOT NULL DEFAULT false,
    "canIssueCertificate" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LmsQuota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LmsSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lmsPackageId" TEXT NOT NULL,
    "durationMonths" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "priceBase" INTEGER NOT NULL,
    "discountPct" INTEGER NOT NULL DEFAULT 0,
    "priceFinal" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LmsSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LmsSubscriptionInvoice" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "tokenAmount" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PAID',
    "paidAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LmsSubscriptionInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LmsUpgradePackage_tier_key" ON "LmsUpgradePackage"("tier");

-- CreateIndex
CREATE INDEX "LmsUpgradePackage_isActive_sortOrder_idx" ON "LmsUpgradePackage"("isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "LmsQuota_userId_key" ON "LmsQuota"("userId");

-- CreateIndex
CREATE INDEX "LmsSubscription_userId_status_idx" ON "LmsSubscription"("userId", "status");

-- CreateIndex
CREATE INDEX "LmsSubscription_endDate_idx" ON "LmsSubscription"("endDate");

-- CreateIndex
CREATE UNIQUE INDEX "LmsSubscriptionInvoice_invoiceNumber_key" ON "LmsSubscriptionInvoice"("invoiceNumber");

-- AddForeignKey
ALTER TABLE "LmsQuota" ADD CONSTRAINT "LmsQuota_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LmsSubscription" ADD CONSTRAINT "LmsSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LmsSubscription" ADD CONSTRAINT "LmsSubscription_lmsPackageId_fkey" FOREIGN KEY ("lmsPackageId") REFERENCES "LmsUpgradePackage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LmsSubscriptionInvoice" ADD CONSTRAINT "LmsSubscriptionInvoice_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "LmsSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

