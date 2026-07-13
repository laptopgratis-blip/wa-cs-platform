# PLAN: Multi-Gudang + Auto-Pilih Gudang Termurah

> Status: **PLAN** (belum eksekusi) · Dibuat 2026-07-13
> Tujuan: user bisa setup >1 gudang, dan saat customer isi alamat, sistem otomatis pilih gudang termurah/terdekat untuk hemat ongkir.

## 1. Kondisi sekarang (yang sudah ada — dimanfaatkan)

- **Origin tunggal:** `UserShippingProfile.originCityId` (1:1 per user) — sebenarnya menyimpan **Komerce destination ID** level subdistrict, presisi untuk ongkir.
- **Mesin ongkir:** `calculateShippingCost({origin, destination, weight, couriers})` di `lib/services/rajaongkir.ts`. Cache key = `origin:dest:weight:couriers` → **multi-origin sudah otomatis ke-cache** (tak perlu ubah cache).
- **Titik hitung ongkir:**
  - `calculateOrderTotal()` di `lib/services/order-pricing.ts` (baris ~235–259) — dipakai preview & submit; origin diambil tunggal dari `profile.originCityId`.
  - `app/api/orders/cost-preview/route.ts` — daftar kurir saat customer isi alamat.
  - `lib/services/cs-ai-context.ts` — AI CS quote ongkir di chat.
- **Kuota Komerce Starter 500 hit/hari** — sudah pernah jebol 2× (incident 2026-06-10 & 2026-07-10). **Plan wajib hemat panggilan API.**

## 2. Keputusan kunci

**Stok per gudang — TIDAK masuk MVP.** Permintaan murni soal *origin & ongkir* ("kirim dari alamat terdekat, hemat ongkir"). MVP = **origin-only**: gudang cuma titik kirim; produk dianggap tersedia di semua gudang. Alokasi stok per-gudang + split-shipment = fitur besar terpisah → **Fase 4 (opsional)**.

**1 order = 1 gudang** (gudang termurah). Tidak ada pecah kirim → fulfillment simpel.

## 3. Perubahan data (schema)

```prisma
model Warehouse {
  id     String @id @default(cuid())
  userId String
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  name   String                    // "Gudang Bandung", "Gudang Surabaya"
  // origin = Komerce destination ID (reuse pencari destinasi yang sudah ada)
  originId       Int
  cityName       String
  provinceName   String
  regionCode     String            // "JAWA","SUMATERA",... — di-derive dari provinsi, untuk prefilter
  isActive       Boolean @default(true)
  isDefault      Boolean @default(false)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@index([userId, isActive])
}
```

- `UserOrder` tambah: `warehouseId String?` + `originSnapshot Json?` (nama+kota gudang saat order dibuat → penjual tahu kirim dari mana walau gudang dihapus).
- `UserShippingProfile.originCityId/Name` **JANGAN dihapus** — dipakai sebagai sumber backfill + fallback backward-compat.

## 4. Algoritma pilih gudang (inti fitur — hemat kuota + hemat ongkir)

Gudang terdekat ≠ selalu termurah (tarif kurir per-zona), tapi prefilter geografis mempersempit kandidat lalu cost-compare memastikan termurah. **Hybrid:**

1. **Rank gudang by kedekatan ke tujuan:**
   - Tier 1: kota sama (`cityName` match)
   - Tier 2: provinsi sama (`provinceName` match)
   - Tier 3: region/pulau sama (`regionCode`, peta statis 34 provinsi → 7 region)
   - Tier 4: sisanya
2. **Ambil kandidat** = gudang di tier terdekat yang terisi, cap **maks 2–3**. (Kalau user cuma punya 1 gudang → langsung pakai, **0 panggilan ekstra**, identik perilaku sekarang.)
3. **Cost-compare kandidat** via `calculateShippingCost` (cache-first) → pilih gudang dengan ongkir **termurah**.
4. Simpan `warehouseId` terpilih → dipakai konsisten saat submit (deterministik: input sama → hasil sama).

→ Panggilan API dibatasi **≤ jumlah kandidat (2–3)**, bukan semua gudang. Cache destinasi berulang meredam sisanya.

## 5. Titik integrasi kode (file persis)

| File | Ubahan |
|---|---|
| `lib/services/warehouse-selector.ts` **(baru)** | `pickBestWarehouse({userId, destinationId, destCity, destProvince, weight, couriers})` → `{warehouse, services}`. Isi algoritma #4. |
| `lib/services/order-pricing.ts` | Ganti blok `profile.originCityId` (baris 235–259) → panggil `pickBestWarehouse`; tambah `warehouseId` di `PricingResult`. Fallback ke `UserShippingProfile` kalau belum ada gudang. |
| `app/api/orders/cost-preview/route.ts` | Pakai selector; balikan daftar kurir dari gudang termurah + `warehouseId` + label "Dikirim dari: <gudang>". |
| `app/api/orders/submit` (route submit) | Persist `warehouseId` + `originSnapshot`. |
| `lib/services/cs-ai-context.ts` | Helper ongkir AI CS pakai selector yang sama (biar quote di chat konsisten). |
| `lib/utils/region-map.ts` **(baru)** | Peta provinsi → regionCode (statis, ~34 baris). |

## 6. UI/UX

- **Halaman baru `/warehouses`** — CRUD gudang, mirror pola `bank-accounts` (multi + set default). Input origin pakai **pencari destinasi Komerce yang sudah ada** (`searchDestinations`); `regionCode` di-derive otomatis dari provinsi terpilih.
- **Form order publik / cost-preview:** tak berubah untuk customer — dia isi alamat seperti biasa; sistem otomatis pilih gudang & tampil "📦 Dikirim dari Gudang Bandung". Zero friksi baru.
- **Detail/fulfillment order (dashboard):** tampilkan gudang asal per order supaya penjual tahu dari mana packing.
- Migrasi UI: `shipping-profile` lama tetap ada untuk kurir & WA-konfirmasi; origin-nya di-hint "pindah ke Gudang".

## 7. Migrasi (aman, tanpa downtime)

- Migration backfill: tiap user dengan `originCityId` → buat 1 `Warehouse` (`isDefault=true`) dari data itu. User existing langsung punya "Gudang Utama", perilaku identik hari ini.
- Selama transisi, selector fallback: kalau tak ada Warehouse → pakai `UserShippingProfile.originCityId` (backward-compat penuh).

## 8. Fase implementasi

- **Fase 0 ✅ SELESAI (2026-07-13)** — schema `Warehouse` + `UserOrder.warehouseId/originSnapshot` + migration `20260713060000_multi_warehouse` (backfill 15 gudang default). Applied ke DB prod, zero downtime.
- **Fase 1** — halaman `/warehouses` (CRUD + default), reuse pencari destinasi.
- **Fase 2 (inti)** — `warehouse-selector.ts` + `region-map.ts` + wire ke `order-pricing` & `cost-preview` & submit. **Di sini fitur "auto gudang termurah" hidup.**
- **Fase 3** — AI CS pakai selector + fulfillment view tampil gudang.
- **Fase 4 (opsional, nanti)** — stok/ketersediaan produk per gudang + split-shipment. **Ditunda** kecuali dibutuhkan.

## 9. Edge case yang ditangani

- 1 gudang → 0 panggilan API ekstra (identik sekarang).
- Belum ada gudang → fallback origin lama (`UserShippingProfile.originCityId`).
- Kuota habis → stale cache; kalau kandidat termurah gagal dihitung, jatuh ke kandidat berikut/default.
- COD flat (`OrderForm.shippingFlatCod`) → skip selector (tak kena RajaOngkir).
- Zone subsidy (`ShippingZone`) → tetap jalan, di-apply setelah gudang dipilih (tak berubah).
- Berat/varian produk → tak terpengaruh.

## 10. Estimasi & simplifikasi sengaja

- **Estimasi:** Fase 0–3 (MVP fungsional) ~2–3 hari kerja. Fase 4 (stok per gudang) terpisah, ~+3–4 hari kalau nanti perlu.
- **Sengaja disederhanakan:** stok per-gudang (Fase 4), split-shipment (dibuang — 1 order 1 gudang). Kalau butuh "gudang A habis → auto ambil gudang B", naikkan ke Fase 4.
