# Dokumentasi RajaOngkir (Komerce)

Integrasi ongkir & pencarian alamat domestik. Provider: **RajaOngkir by Komerce**, tier **Starter (500 hit/hari)**.

## Kredensial

```
RAJAONGKIR_API_KEY="SIW4mbwkbeb2cced0b4a3b68wqEv82G0"
```

- Diset di `.env.production` (lihat `.env.production:1`).
- **JANGAN** expose ke client. API key cuma dipakai server-side di `lib/services/rajaongkir.ts` lewat header `key`.
- Semua call dari browser harus lewat proxy route `/api/shipping/*` — bukan langsung ke Komerce.
- Base URL: `https://rajaongkir.komerce.id/api/v1`

## Cara pakai upstream (raw, server-side)

Header otentikasi selalu: `key: <RAJAONGKIR_API_KEY>` (bukan `Authorization`).

### 1. Cari destinasi

```
GET /destination/domestic-destination?search=bandung&limit=10&offset=0
Header: key: SIW4mbwkbeb2cced0b4a3b68wqEv82G0
```

- Return level subdistrict (kelurahan) + parent (district, city, province, zip).
- Sukses: `meta.code === 200`, data di `data[]`.
- `404` = query tanpa hasil (bukan error sistem).
- Ambil `id` dari hasil ini untuk dipakai sebagai `origin`/`destination` di hitung ongkir.

### 2. Hitung ongkir

```
POST /calculate/domestic-cost
Header: key: <API_KEY>, Content-Type: application/x-www-form-urlencoded
Body: origin=<id>&destination=<id>&weight=<gram>&courier=jne:sicepat&price=lowest
```

- `courier` dipisah `:` (titik dua), contoh `jne:sicepat:jnt:anteraja`.
- `weight` dalam **gram**.
- Kurir didukung: `jne`, `sicepat`, `jnt`, `anteraja` (lihat `SUPPORTED_COURIERS`).

## Cara pakai dari aplikasi (proxy route)

Pakai ini dari frontend, bukan upstream langsung. Keduanya plan-gated lewat `requireOrderSystemAccess()` — hanya paket POWER.

### `GET /api/shipping/destinations?q=bandung&limit=10`

```json
{ "success": true, "data": { "items": [ { "id": 123, "label": "...", "city_name": "...", "zip_code": "..." } ] } }
```

- `q` minimal 2 karakter, kalau kurang return `items: []`.
- `limit` di-cap maks 20.

### `POST /api/shipping/cost`

```json
// request body
{ "origin": 123, "destination": 456, "weight": 1000, "couriers": ["jne", "sicepat"] }
```

```json
// response
{ "success": true, "data": { "services": [ { "name": "JNE", "code": "jne", "service": "REG", "cost": 12000, "etd": "1-2 day" } ] } }
```

- Validasi Zod: `weight` 1–150.000 gram, minimal 1 kurir.

## Caching & kuota

Kuota cuma 500 hit/hari, jadi caching wajib (incident kuota jebol 2026-06-10):

| Data | Cache | TTL | Tabel |
|------|-------|-----|-------|
| Destinasi | DB persisten | 30 hari | `ShippingDestinationCache` |
| Ongkir | DB persisten | 6 jam | `ShippingCostCache` |

- Cache di DB (bukan Next fetch-cache) karena fetch-cache hangus tiap build image.
- Negative cache aktif: query destinasi tanpa hasil (404) juga di-cache → tidak bakar kuota berulang.
- Kalau upstream gagal (kuota habis / down), service fallback ke cache basi (umur berapa pun) daripada return kosong.

## Rotasi key

Kalau key bocor/diganti: edit `RAJAONGKIR_API_KEY` di `.env.production`, redeploy. Tidak ada referensi key di tempat lain — semua baca `process.env.RAJAONGKIR_API_KEY` lewat `getApiKey()`.
