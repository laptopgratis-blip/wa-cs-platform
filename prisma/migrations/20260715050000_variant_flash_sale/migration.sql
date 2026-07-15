-- Flash sale per varian (2026-07-15): harga diskon bisa diset per
-- ProductVariant. Jadwal/kuota/toggle tetap level Product. null = varian
-- tidak ikut flash sale.
ALTER TABLE "ProductVariant" ADD COLUMN "flashSalePrice" DOUBLE PRECISION;
