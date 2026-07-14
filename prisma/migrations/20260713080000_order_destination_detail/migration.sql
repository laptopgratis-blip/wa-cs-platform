-- Detail area destinasi di order: kecamatan (district) & kelurahan
-- (subdistrict) dari master Komerce — supaya invoice/detail pesanan
-- menampilkan tujuan lengkap, bukan cuma kota.
ALTER TABLE "UserOrder" ADD COLUMN "shippingDistrictName" TEXT;
ALTER TABLE "UserOrder" ADD COLUMN "shippingSubdistrictName" TEXT;

-- Backfill order lama: shippingCityId menyimpan destination id Komerce
-- (angka dalam TEXT) — lookup ke master yang sudah terisi dari cache search.
-- Guard regex supaya nilai non-numerik lama tidak bikin CAST error.
UPDATE "UserOrder" u
SET "shippingDistrictName"    = d."districtName",
    "shippingSubdistrictName" = d."subdistrictName"
FROM "ShippingDestination" d
WHERE u."shippingCityId" IS NOT NULL
  AND u."shippingCityId" ~ '^[0-9]+$'
  AND u."shippingDistrictName" IS NULL
  AND d.id = CAST(u."shippingCityId" AS INTEGER);
