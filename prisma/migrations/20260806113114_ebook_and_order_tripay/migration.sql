-- CreateEnum
CREATE TYPE "EbookFileFormat" AS ENUM ('PDF', 'EPUB');

-- CreateEnum
CREATE TYPE "EbookAccessStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');

-- AlterTable
ALTER TABLE "OrderForm" ADD COLUMN     "acceptTripay" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "ebookId" TEXT;

-- AlterTable
ALTER TABLE "UserOrder" ADD COLUMN     "isDigitalOnly" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Ebook" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "coverUrl" TEXT,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileFormat" "EbookFileFormat" NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "fileSha256" TEXT NOT NULL,
    "maxDownloads" INTEGER NOT NULL DEFAULT 20,
    "accessDays" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ebook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EbookEntitlement" (
    "id" TEXT NOT NULL,
    "ebookId" TEXT NOT NULL,
    "buyerPhone" TEXT NOT NULL,
    "buyerName" TEXT,
    "buyerEmail" TEXT,
    "orderId" TEXT,
    "invoiceNumber" TEXT,
    "pricePaidRp" DOUBLE PRECISION,
    "status" "EbookAccessStatus" NOT NULL DEFAULT 'ACTIVE',
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokeReason" TEXT,
    "maxDownloads" INTEGER NOT NULL,
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "accessNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EbookEntitlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EbookDownloadToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "entitlementId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EbookDownloadToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EbookDownloadLog" (
    "id" TEXT NOT NULL,
    "entitlementId" TEXT NOT NULL,
    "tokenId" TEXT,
    "status" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EbookDownloadLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderPayment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "merchantRef" TEXT NOT NULL,
    "reference" TEXT,
    "feeCustomer" INTEGER NOT NULL DEFAULT 0,
    "amount" INTEGER NOT NULL,
    "channelCode" TEXT NOT NULL,
    "channelName" TEXT,
    "payCode" TEXT,
    "checkoutUrl" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "expiredAt" TIMESTAMP(3),
    "rawCallback" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Ebook_filePath_key" ON "Ebook"("filePath");

-- CreateIndex
CREATE INDEX "Ebook_userId_isActive_idx" ON "Ebook"("userId", "isActive");

-- CreateIndex
CREATE INDEX "EbookEntitlement_buyerPhone_idx" ON "EbookEntitlement"("buyerPhone");

-- CreateIndex
CREATE INDEX "EbookEntitlement_orderId_idx" ON "EbookEntitlement"("orderId");

-- CreateIndex
CREATE INDEX "EbookEntitlement_ebookId_status_idx" ON "EbookEntitlement"("ebookId", "status");

-- CreateIndex
CREATE INDEX "EbookEntitlement_accessNotifiedAt_idx" ON "EbookEntitlement"("accessNotifiedAt");

-- CreateIndex
CREATE UNIQUE INDEX "EbookEntitlement_ebookId_buyerPhone_key" ON "EbookEntitlement"("ebookId", "buyerPhone");

-- CreateIndex
CREATE UNIQUE INDEX "EbookDownloadToken_token_key" ON "EbookDownloadToken"("token");

-- CreateIndex
CREATE INDEX "EbookDownloadToken_entitlementId_idx" ON "EbookDownloadToken"("entitlementId");

-- CreateIndex
CREATE INDEX "EbookDownloadToken_expiresAt_idx" ON "EbookDownloadToken"("expiresAt");

-- CreateIndex
CREATE INDEX "EbookDownloadLog_entitlementId_createdAt_idx" ON "EbookDownloadLog"("entitlementId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "OrderPayment_merchantRef_key" ON "OrderPayment"("merchantRef");

-- CreateIndex
CREATE UNIQUE INDEX "OrderPayment_reference_key" ON "OrderPayment"("reference");

-- CreateIndex
CREATE INDEX "OrderPayment_orderId_createdAt_idx" ON "OrderPayment"("orderId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "OrderPayment_status_createdAt_idx" ON "OrderPayment"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Product_ebookId_key" ON "Product"("ebookId");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_ebookId_fkey" FOREIGN KEY ("ebookId") REFERENCES "Ebook"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ebook" ADD CONSTRAINT "Ebook_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EbookEntitlement" ADD CONSTRAINT "EbookEntitlement_ebookId_fkey" FOREIGN KEY ("ebookId") REFERENCES "Ebook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EbookEntitlement" ADD CONSTRAINT "EbookEntitlement_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "UserOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EbookDownloadToken" ADD CONSTRAINT "EbookDownloadToken_entitlementId_fkey" FOREIGN KEY ("entitlementId") REFERENCES "EbookEntitlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EbookDownloadLog" ADD CONSTRAINT "EbookDownloadLog_entitlementId_fkey" FOREIGN KEY ("entitlementId") REFERENCES "EbookEntitlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderPayment" ADD CONSTRAINT "OrderPayment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "UserOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

