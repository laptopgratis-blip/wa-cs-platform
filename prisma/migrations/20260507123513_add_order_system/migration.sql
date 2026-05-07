-- AlterTable
ALTER TABLE "LpUpgradePackage" ADD COLUMN     "canUseOrderSystem" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "UserOrder" ADD COLUMN     "appliedZoneId" TEXT,
ADD COLUMN     "appliedZoneName" TEXT,
ADD COLUMN     "bankAccountSnapshot" JSONB,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledReason" TEXT,
ADD COLUMN     "customerEmail" TEXT,
ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "flashSaleDiscountRp" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "invoiceNumber" TEXT,
ADD COLUMN     "orderFormId" TEXT,
ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "paymentNote" TEXT,
ADD COLUMN     "shippedAt" TIMESTAMP(3),
ADD COLUMN     "shippingAddress" TEXT,
ADD COLUMN     "shippingCityId" TEXT,
ADD COLUMN     "shippingCityName" TEXT,
ADD COLUMN     "shippingCostRp" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "shippingCourier" TEXT,
ADD COLUMN     "shippingEtd" TEXT,
ADD COLUMN     "shippingPostalCode" TEXT,
ADD COLUMN     "shippingProvinceId" TEXT,
ADD COLUMN     "shippingProvinceName" TEXT,
ADD COLUMN     "shippingService" TEXT,
ADD COLUMN     "shippingSubsidyRp" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "subtotalRp" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "totalRp" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "uniqueCode" INTEGER;

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DOUBLE PRECISION NOT NULL,
    "weightGrams" INTEGER NOT NULL DEFAULT 500,
    "imageUrl" TEXT,
    "stock" INTEGER,
    "flashSalePrice" DOUBLE PRECISION,
    "flashSaleStartAt" TIMESTAMP(3),
    "flashSaleEndAt" TIMESTAMP(3),
    "flashSaleQuota" INTEGER,
    "flashSaleSold" INTEGER NOT NULL DEFAULT 0,
    "flashSaleActive" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBankAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserShippingProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "originCityId" TEXT,
    "originCityName" TEXT,
    "originProvinceName" TEXT,
    "enabledCouriers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "defaultWeightGrams" INTEGER NOT NULL DEFAULT 500,
    "waConfirmNumber" TEXT,
    "waConfirmTemplate" TEXT,
    "waConfirmActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserShippingProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderForm" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "productIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "acceptCod" BOOLEAN NOT NULL DEFAULT true,
    "acceptTransfer" BOOLEAN NOT NULL DEFAULT true,
    "shippingFlatCod" DOUBLE PRECISION,
    "showFlashSaleCounter" BOOLEAN NOT NULL DEFAULT true,
    "showShippingPromo" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "views" INTEGER NOT NULL DEFAULT 0,
    "submissions" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderForm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShippingZone" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "matchType" TEXT NOT NULL DEFAULT 'CITY',
    "cityIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "provinceIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cityNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "provinceNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "subsidyType" TEXT NOT NULL DEFAULT 'NONE',
    "subsidyValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "minimumOrder" DOUBLE PRECISION,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShippingZone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShippingCostCache" (
    "id" TEXT NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "responseJson" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShippingCostCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Product_userId_isActive_idx" ON "Product"("userId", "isActive");

-- CreateIndex
CREATE INDEX "UserBankAccount_userId_isActive_idx" ON "UserBankAccount"("userId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "UserShippingProfile_userId_key" ON "UserShippingProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderForm_slug_key" ON "OrderForm"("slug");

-- CreateIndex
CREATE INDEX "OrderForm_slug_idx" ON "OrderForm"("slug");

-- CreateIndex
CREATE INDEX "OrderForm_userId_idx" ON "OrderForm"("userId");

-- CreateIndex
CREATE INDEX "ShippingZone_userId_isActive_idx" ON "ShippingZone"("userId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ShippingCostCache_cacheKey_key" ON "ShippingCostCache"("cacheKey");

-- CreateIndex
CREATE INDEX "ShippingCostCache_expiresAt_idx" ON "ShippingCostCache"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserOrder_invoiceNumber_key" ON "UserOrder"("invoiceNumber");

-- CreateIndex
CREATE INDEX "UserOrder_invoiceNumber_idx" ON "UserOrder"("invoiceNumber");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBankAccount" ADD CONSTRAINT "UserBankAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserShippingProfile" ADD CONSTRAINT "UserShippingProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderForm" ADD CONSTRAINT "OrderForm_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShippingZone" ADD CONSTRAINT "ShippingZone_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

