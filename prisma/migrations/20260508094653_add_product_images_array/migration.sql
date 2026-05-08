-- AlterTable
ALTER TABLE "Product" ADD COLUMN "images" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Backfill: kalau produk lama punya imageUrl tapi images kosong, set images = [imageUrl].
UPDATE "Product"
SET "images" = ARRAY["imageUrl"]
WHERE "imageUrl" IS NOT NULL AND ("images" IS NULL OR cardinality("images") = 0);
