-- AlterTable
ALTER TABLE "EbookEntitlement" ADD COLUMN     "purchaseCount" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "totalDownloadCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalPaidRp" DOUBLE PRECISION NOT NULL DEFAULT 0;


-- ── Backfill akumulator dari data historis ─────────────────────────────
-- 1) Baseline dari snapshot terakhir (entitlement tanpa order ter-lacak
--    tetap dapat nilai wajar).
UPDATE "EbookEntitlement" SET "totalPaidRp" = COALESCE("pricePaidRp", 0);

-- 2) Override dari order PAID sesungguhnya: hitung semua order milik nomor
--    pembeli yang item-nya berisi produk ber-ebook tsb (kasus beli ulang
--    sebelum kolom ini ada — mis. 5x order = terjual 5, omzet 5x harga).
UPDATE "EbookEntitlement" ee
SET "purchaseCount" = s.cnt,
    "totalPaidRp"   = s.total
FROM (
  SELECT ee2.id,
         COUNT(DISTINCT o.id) AS cnt,
         SUM((i->>'price')::float * COALESCE(NULLIF(i->>'qty','')::int, 1)) AS total
  FROM "EbookEntitlement" ee2
  JOIN "Product" p ON p."ebookId" = ee2."ebookId"
  JOIN "UserOrder" o
    ON o."customerPhone" = ee2."buyerPhone"
   AND o."paymentStatus" = 'PAID'
  JOIN LATERAL jsonb_array_elements(o.items) i
    ON i->>'productId' = p.id
  GROUP BY ee2.id
) s
WHERE s.id = ee.id;

-- 3) Download lifetime dari audit log SUCCESS (downloadCount bisa sudah
--    ke-reset oleh re-order; log menyimpan sejarah penuh).
UPDATE "EbookEntitlement" ee
SET "totalDownloadCount" = GREATEST(ee."downloadCount", s.cnt)
FROM (
  SELECT "entitlementId" AS eid, COUNT(*) AS cnt
  FROM "EbookDownloadLog"
  WHERE status = 'SUCCESS'
  GROUP BY 1
) s
WHERE s.eid = ee.id;
