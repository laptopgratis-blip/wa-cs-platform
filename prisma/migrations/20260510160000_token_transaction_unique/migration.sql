-- Dedup existing rows where (userId, reference, type) bertabrakan — keep the
-- earliest per grup. Hanya berlaku untuk reference IS NOT NULL (NULL berarti
-- transaksi non-payment yang memang tidak boleh di-dedup).
DELETE FROM "TokenTransaction"
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY "userId", "reference", "type"
      ORDER BY "createdAt" ASC, id ASC
    ) AS rn
    FROM "TokenTransaction"
    WHERE "reference" IS NOT NULL
  ) t
  WHERE rn > 1
);

-- CreateIndex (unique) — Postgres treat NULL as distinct sehingga BONUS/ADJUST
-- yg reference NULL tetap bisa banyak baris. Untuk PURCHASE & USAGE yg punya
-- reference, dedup webhook+polling race aman.
CREATE UNIQUE INDEX "TokenTransaction_userId_reference_type_key"
  ON "TokenTransaction"("userId", "reference", "type");
