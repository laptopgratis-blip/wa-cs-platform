-- CS AI Integrations — 1:1 dengan User. Toggle sekali-klik untuk:
--   - productCatalogEnabled  : AI tahu katalog produk aktif
--   - shippingCalcEnabled    : AI hitung ongkir otomatis (pakai
--     UserShippingProfile.originCityId sebagai asal, ShippingZone untuk subsidi)
-- Default semua false → opt-in eksplisit oleh user dari halaman /knowledge.
CREATE TABLE "CsAiIntegration" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productCatalogEnabled" BOOLEAN NOT NULL DEFAULT false,
    "shippingCalcEnabled" BOOLEAN NOT NULL DEFAULT false,
    "applySubsidyRules" BOOLEAN NOT NULL DEFAULT true,
    "applyFlashSaleDiscount" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CsAiIntegration_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CsAiIntegration_userId_key" ON "CsAiIntegration"("userId");

ALTER TABLE "CsAiIntegration" ADD CONSTRAINT "CsAiIntegration_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
