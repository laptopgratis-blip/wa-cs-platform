-- LiveRoom: produk unggulan (pinned) per room.
-- Nullable → aman untuk room yang sudah ada (fallback ke productIds[0]).

ALTER TABLE "LiveRoom" ADD COLUMN "featuredProductId" TEXT;
