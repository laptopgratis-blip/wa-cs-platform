-- Master destinasi Komerce untuk search lokal (hemat kuota RajaOngkir
-- Starter 500 hit/hari — incident kuota jebol 2026-07-10).

-- CreateTable
CREATE TABLE "ShippingDestination" (
    "id" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "provinceName" TEXT NOT NULL,
    "cityName" TEXT NOT NULL,
    "districtName" TEXT NOT NULL,
    "subdistrictName" TEXT NOT NULL,
    "zipCode" TEXT NOT NULL,
    "searchText" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShippingDestination_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShippingDestination_searchText_idx" ON "ShippingDestination"("searchText");

-- Backfill one-time dari payload ShippingDestinationCache (array destinasi per
-- query yang pernah sukses). Destinasi yang muncul di banyak query diambil
-- sekali (DISTINCT ON id). Format searchText HARUS sama dengan
-- buildDestinationSearchText() di lib/services/rajaongkir.ts:
-- lowercase "subdistrict district city province zip", subdistrict "-" di-skip.
INSERT INTO "ShippingDestination"
  ("id", "label", "provinceName", "cityName", "districtName", "subdistrictName", "zipCode", "searchText", "updatedAt")
SELECT DISTINCT ON ((elem->>'id')::int)
  (elem->>'id')::int,
  COALESCE(elem->>'label', ''),
  COALESCE(elem->>'province_name', ''),
  COALESCE(elem->>'city_name', ''),
  COALESCE(elem->>'district_name', ''),
  COALESCE(elem->>'subdistrict_name', ''),
  COALESCE(elem->>'zip_code', ''),
  lower(trim(concat_ws(' ',
    NULLIF(elem->>'subdistrict_name', '-'),
    elem->>'district_name',
    elem->>'city_name',
    elem->>'province_name',
    elem->>'zip_code'
  ))),
  CURRENT_TIMESTAMP
FROM "ShippingDestinationCache" c
CROSS JOIN LATERAL jsonb_array_elements(c.payload) AS elem
WHERE jsonb_typeof(c.payload) = 'array'
  AND (elem->>'id') ~ '^[0-9]+$'
ON CONFLICT ("id") DO NOTHING;
