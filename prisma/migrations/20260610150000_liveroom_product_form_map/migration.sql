-- LiveRoom: pemetaan form order per-produk (JSON { productId: orderFormSlug }).
-- Nullable → aman untuk room yang sudah ada (fallback ke orderFormSlug default).

ALTER TABLE "LiveRoom" ADD COLUMN "productFormMap" JSONB;
