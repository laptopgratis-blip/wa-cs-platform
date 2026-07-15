-- Subscription quota sync (2026-07-14)
--
-- Konteks: entitlement UserQuota sebelumnya ditulis dua sistem (subscription
-- vs akumulasi top-up legacy) dan tidak ada jalur yang menulis SEMUA kolom
-- (maxVisitorMonth/maxImageSizeMB tidak pernah di-set per tier). Mulai commit
-- ini kuota = turunan subscription hidup (lib/services/subscription.ts:
-- syncQuotaFromSubscriptions); mekanisme tier-dari-top-up dihapus.
--
-- Migration ini:
--   1. Tambah kolom UserQuota.legacyTier (grandfather era pra-subscription).
--   2. Snapshot legacyTier utk akun yang tier kuotanya > hak subscription
--      hidupnya (97 akun legacy top-up + pembeli LP_UPGRADE one-time).
--   3. Backfill semua kolom entitlement per tier efektif.
--      Kebijakan (keputusan owner 2026-07-14):
--      - visitor cap & maxLp/maxStorage: RAISE-ONLY (GREATEST — tidak ada
--        user yang turun hari ini; normalisasi strict terjadi alami saat
--        event subscription berikutnya via sync).
--      - maxImageSizeMB: strict per tier (semua row masih 1 → hanya naik).
--      - tier: tidak pernah turun (legacyTier menjaga floor).
--
-- Angka entitlement per tier = mirror lib/lp-quota.ts TIERS — kalau diubah
-- di sana, jangan lupa jalur backfill berikutnya:
--   rank: FREE 0 / STARTER 1 / POPULAR 2 / POWER 3
--   maxLp: 1 / 3 / 10 / 999
--   maxStorageMB: 5 / 20 / 100 / 500
--   maxVisitorMonth: 1000 / 20000 / 100000 / 5000000
--   maxImageSizeMB: 1 / 3 / 5 / 10
--
-- Idempotent: UPDATE murni dari state (menjalankan ulang menghasilkan nilai
-- sama); ADD COLUMN akan gagal kalau diulang — normal untuk migration.

-- 1. DDL
ALTER TABLE "UserQuota" ADD COLUMN "legacyTier" "LpTier";

-- 2. Snapshot grandfather: tier kuota saat ini > rank subscription hidup.
UPDATE "UserQuota" q
SET "legacyTier" = q.tier
WHERE q.tier <> 'FREE'
  AND (CASE q.tier
         WHEN 'POWER' THEN 3
         WHEN 'POPULAR' THEN 2
         WHEN 'STARTER' THEN 1
         ELSE 0
       END) > COALESCE(
    (
      SELECT MAX(CASE p.tier
                   WHEN 'POWER' THEN 3
                   WHEN 'POPULAR' THEN 2
                   WHEN 'STARTER' THEN 1
                   ELSE 0
                 END)
      FROM "Subscription" s
      JOIN "LpUpgradePackage" p ON p.id = s."lpPackageId"
      WHERE s."userId" = q."userId"
        AND s.status IN ('ACTIVE', 'CANCELLED')
        AND (s."isLifetime" = true OR s."endDate" > NOW())
    ),
    0
  );

-- 3. Backfill entitlement dari tier efektif = max(sub hidup, legacyTier).
WITH live AS (
  SELECT s."userId",
         CASE p.tier
           WHEN 'POWER' THEN 3
           WHEN 'POPULAR' THEN 2
           WHEN 'STARTER' THEN 1
           ELSE 0
         END AS rank,
         p."maxLp"        AS max_lp,
         p."maxStorageMB" AS max_storage
  FROM "Subscription" s
  JOIN "LpUpgradePackage" p ON p.id = s."lpPackageId"
  WHERE s.status IN ('ACTIVE', 'CANCELLED')
    AND (s."isLifetime" = true OR s."endDate" > NOW())
),
sub_top AS (
  SELECT "userId", MAX(rank) AS rank FROM live GROUP BY 1
),
-- Limit paket pada rank pemenang (paket bisa diset admin > default tier).
sub_win AS (
  SELECT l."userId", t.rank,
         MAX(l.max_lp)      AS max_lp,
         MAX(l.max_storage) AS max_storage
  FROM live l
  JOIN sub_top t ON t."userId" = l."userId" AND t.rank = l.rank
  GROUP BY 1, 2
),
eff AS (
  SELECT q."userId" AS uid,
         COALESCE(w.rank, 0) AS sub_rank,
         GREATEST(
           COALESCE(w.rank, 0),
           CASE q."legacyTier"
             WHEN 'POWER' THEN 3
             WHEN 'POPULAR' THEN 2
             WHEN 'STARTER' THEN 1
             ELSE 0
           END
         ) AS rank_eff,
         w.max_lp      AS sub_max_lp,
         w.max_storage AS sub_max_storage
  FROM "UserQuota" q
  LEFT JOIN sub_win w ON w."userId" = q."userId"
)
UPDATE "UserQuota" q
SET tier = (CASE e.rank_eff
              WHEN 3 THEN 'POWER'
              WHEN 2 THEN 'POPULAR'
              WHEN 1 THEN 'STARTER'
              ELSE 'FREE'
            END)::"LpTier",
    "maxLp" = GREATEST(
      q."maxLp",
      CASE WHEN e.sub_rank = e.rank_eff AND e.sub_max_lp IS NOT NULL
           THEN e.sub_max_lp
           ELSE CASE e.rank_eff WHEN 3 THEN 999 WHEN 2 THEN 10 WHEN 1 THEN 3 ELSE 1 END
      END
    ),
    "maxStorageMB" = GREATEST(
      q."maxStorageMB",
      CASE WHEN e.sub_rank = e.rank_eff AND e.sub_max_storage IS NOT NULL
           THEN e.sub_max_storage
           ELSE CASE e.rank_eff WHEN 3 THEN 500 WHEN 2 THEN 100 WHEN 1 THEN 20 ELSE 5 END
      END
    ),
    "maxVisitorMonth" = GREATEST(
      q."maxVisitorMonth",
      CASE e.rank_eff WHEN 3 THEN 5000000 WHEN 2 THEN 100000 WHEN 1 THEN 20000 ELSE 1000 END
    ),
    "maxImageSizeMB" = CASE e.rank_eff WHEN 3 THEN 10 WHEN 2 THEN 5 WHEN 1 THEN 3 ELSE 1 END,
    "canAiGenerate" = (e.rank_eff > 0)
FROM eff e
WHERE q."userId" = e.uid;
