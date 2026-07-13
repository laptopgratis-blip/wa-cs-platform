-- CreateTable
CREATE TABLE "Warehouse" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "originId" INTEGER NOT NULL,
    "cityName" TEXT NOT NULL,
    "provinceName" TEXT NOT NULL,
    "regionCode" TEXT NOT NULL DEFAULT 'LAINNYA',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Warehouse_userId_isActive_idx" ON "Warehouse"("userId", "isActive");

-- AlterTable
ALTER TABLE "UserOrder" ADD COLUMN     "warehouseId" TEXT,
ADD COLUMN     "originSnapshot" JSONB;

-- AddForeignKey
ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserOrder" ADD CONSTRAINT "UserOrder_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill (Fase 0): 1 Warehouse default per user dari UserShippingProfile yang
-- sudah punya origin. originCityId lama = Komerce destination ID (numeric string).
-- regionCode dibiarkan 'LAINNYA' — user single-gudang tak butuh prefilter region;
-- gudang ke-2 dst yang ditambah via UI Fase 1 akan diisi regionCode benar.
INSERT INTO "Warehouse" ("id", "userId", "name", "originId", "cityName", "provinceName", "regionCode", "isActive", "isDefault", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text,
       p."userId",
       'Gudang Utama',
       p."originCityId"::integer,
       COALESCE(NULLIF(p."originCityName", ''), 'Gudang Utama'),
       COALESCE(p."originProvinceName", ''),
       'LAINNYA',
       true,
       true,
       CURRENT_TIMESTAMP,
       CURRENT_TIMESTAMP
FROM "UserShippingProfile" p
WHERE p."originCityId" IS NOT NULL
  AND p."originCityId" ~ '^[0-9]+$';
