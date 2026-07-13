// ponytail self-check: logika PURE warehouse-selector.
//   1. regionOfProvince — peta provinsi→region (prefilter). Salah = kandidat keliru.
//   2. rankByProximity — urutan gudang terdekat (F2: COD-flat pilih terdekat/default).
// Jalankan: npx tsx test-warehouse-selector.ts
import { strict as assert } from 'node:assert'

import type { Warehouse } from '@prisma/client'

import { regionOfProvince } from './lib/services/region-map'
import { rankByProximity } from './lib/services/warehouse-selector'

// ── 1. region-map ──────────────────────────────────────────────────────────
const regionCases: Array<[string, string]> = [
  ['JAWA BARAT', 'JAWA'],
  ['DKI JAKARTA', 'JAWA'],
  ['DI YOGYAKARTA', 'JAWA'],
  ['DAERAH ISTIMEWA YOGYAKARTA', 'JAWA'],
  ['BANTEN', 'JAWA'],
  ['SUMATERA UTARA', 'SUMATERA'],
  ['KEPULAUAN RIAU', 'SUMATERA'],
  ['KEPULAUAN BANGKA BELITUNG', 'SUMATERA'],
  ['ACEH', 'SUMATERA'],
  ['LAMPUNG', 'SUMATERA'],
  ['KALIMANTAN TIMUR', 'KALIMANTAN'],
  ['SULAWESI SELATAN', 'SULAWESI'],
  ['GORONTALO', 'SULAWESI'],
  ['BALI', 'BALINUSRA'],
  ['NUSA TENGGARA TIMUR', 'BALINUSRA'],
  ['MALUKU UTARA', 'MALUKU'],
  ['PAPUA BARAT', 'PAPUA'],
]
for (const [prov, expected] of regionCases) {
  assert.equal(regionOfProvince(prov), expected, `${prov} → ${expected}`)
}
assert.equal(regionOfProvince(null), 'LAINNYA')
assert.equal(regionOfProvince(''), 'LAINNYA')
assert.equal(regionOfProvince('NEGARA ASING'), 'LAINNYA')

// ── 2. rankByProximity ───────────────────────────────────────────────────────
function wh(name: string, cityName: string, provinceName: string, regionCode: string): Warehouse {
  return {
    id: name,
    userId: 'u',
    name,
    originId: 1,
    cityName,
    provinceName,
    regionCode,
    isActive: true,
    isDefault: false,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  } as Warehouse
}

// Urutan input = orderBy isDefault desc (JKT = default) → tie-break alami.
const whs = [
  wh('JKT', 'JAKARTA PUSAT, DKI JAKARTA', 'DKI JAKARTA', 'JAWA'),
  wh('SBY', 'SURABAYA, JAWA TIMUR', 'JAWA TIMUR', 'JAWA'),
  wh('MDN', 'MEDAN, SUMATERA UTARA', 'SUMATERA UTARA', 'SUMATERA'),
]
// kota match (tier 0) menang atas provinsi/region.
assert.equal(rankByProximity(whs, 'SURABAYA', 'JAWA TIMUR')[0].name, 'SBY')
// provinsi match (tier 1) menang saat kota tak match.
assert.equal(rankByProximity(whs, 'MALANG', 'JAWA TIMUR')[0].name, 'SBY')
// region match (tier 2) saat beda provinsi; tie-break ke default (JKT).
assert.equal(rankByProximity(whs, 'SEMARANG', 'JAWA TENGAH')[0].name, 'JKT')
// tak ada yang match → default (input pertama) menang.
assert.equal(rankByProximity(whs, 'JAYAPURA', 'PAPUA')[0].name, 'JKT')
// luar pulau match region SUMATERA.
assert.equal(rankByProximity(whs, 'PADANG', 'SUMATERA BARAT')[0].name, 'MDN')

console.log(`OK — ${regionCases.length + 3} region + 5 ranking case lolos`)
