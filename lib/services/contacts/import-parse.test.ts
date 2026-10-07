// Uji parser & normalisasi impor kontak (CSV / tempel spreadsheet).
// Jalankan lewat `npm test`.
import assert from 'node:assert/strict'

import {
  buildImportPlan,
  maskImportPhone,
  normalizeImportPhone,
  normalizeImportTag,
  parseContactTable,
  sanitizeImportName,
  ymdInJakarta,
} from './import-parse'

let passed = 0
function check(name: string, fn: () => void): void {
  fn()
  passed += 1
  console.log(`  ok  ${name}`)
}

console.log('contacts/import-parse: normalizeImportPhone')

function okPhone(raw: string): string {
  const r = normalizeImportPhone(raw)
  assert.equal(r.ok, true, `harus valid: ${raw}`)
  return r.ok ? r.phone : ''
}
function badReason(raw: string): string {
  const r = normalizeImportPhone(raw)
  assert.equal(r.ok, false, `harus tidak valid: ${raw}`)
  return r.ok ? '' : r.reason
}

check("'0812-3456-7890' → 6281234567890", () => {
  assert.equal(okPhone('0812-3456-7890'), '6281234567890')
})
check("'+62 812 3456 7890' → 6281234567890", () => {
  assert.equal(okPhone('+62 812 3456 7890'), '6281234567890')
})
check("'62812...' → digit murni", () => {
  assert.equal(okPhone('6281234567890'), '6281234567890')
})
check("'8123...' (Excel buang nol depan) → 62...", () => {
  assert.equal(okPhone('81234567890'), '6281234567890')
})
check("apostrof Excel \"'0812...\" → valid", () => {
  assert.equal(okPhone("'081234567890"), '6281234567890')
})
check("format (0812) 3456.7890 → valid", () => {
  assert.equal(okPhone('(0812) 3456.7890'), '6281234567890')
})
check('notasi ilmiah Excel 6.28123E+12 → alasan format angka Excel', () => {
  assert.match(badReason('6.28123E+12'), /format angka Excel/)
  assert.match(badReason('6,28123E+12'), /format angka Excel/)
})
check("'+60123456789' (Malaysia) → digit murni", () => {
  assert.equal(okPhone('+60123456789'), '60123456789')
})
check("'0060123456789' (prefiks 00) → diperlakukan seperti +", () => {
  assert.equal(okPhone('0060123456789'), '60123456789')
})
check("'60123456789' tanpa + → wajib +kode negara", () => {
  assert.match(badReason('60123456789'), /luar negeri wajib diawali \+kode negara/)
})
check('+ luar negeri terlalu pendek → tidak valid', () => {
  assert.match(badReason('+6012345'), /10.15 digit/)
})
check('kosong / spasi / apostrof saja → nomor kosong', () => {
  assert.equal(badReason(''), 'nomor kosong')
  assert.equal(badReason('   '), 'nomor kosong')
  assert.equal(badReason("'"), 'nomor kosong')
})
check('huruf di nomor → tidak valid', () => {
  assert.match(badReason('0812abc'), /karakter/)
})
check('nomor Indonesia terlalu pendek → tidak valid', () => {
  assert.match(badReason('08123'), /Indonesia tidak valid/)
})

console.log('contacts/import-parse: sanitizeImportName')

check('trim, rapatkan spasi, buang control char', () => {
  assert.equal(sanitizeImportName('  Budi \t  Santoso\u0007 '), 'Budi Santoso')
})
check('kosong / null → null', () => {
  assert.equal(sanitizeImportName('   '), null)
  assert.equal(sanitizeImportName(null), null)
})
check('dipotong maks 100 karakter', () => {
  assert.equal(sanitizeImportName('a'.repeat(150))?.length, 100)
})

console.log('contacts/import-parse: parseContactTable')

check('CSV koma dengan header Indonesia', () => {
  const r = parseContactTable('Nama,Nomor HP\nBudi,081234567890\nSiti,081298765432\n')
  assert.equal(r.hasHeader, true)
  assert.equal(r.nameColumn, 0)
  assert.equal(r.phoneColumn, 1)
  assert.deepEqual(r.rows, [
    { line: 2, name: 'Budi', phoneRaw: '081234567890' },
    { line: 3, name: 'Siti', phoneRaw: '081298765432' },
  ])
})
check('CSV titik-koma (Excel lokal Indonesia) + header Inggris', () => {
  const r = parseContactTable('Name;Phone\nBudi, S.Kom;081234567890\n')
  assert.equal(r.hasHeader, true)
  assert.deepEqual(r.rows, [{ line: 2, name: 'Budi, S.Kom', phoneRaw: '081234567890' }])
})
check('tempel dari spreadsheet (tab) tanpa header', () => {
  const r = parseContactTable('Budi\t081234567890\nSiti\t+62 812 9876 5432')
  assert.equal(r.hasHeader, false)
  assert.equal(r.phoneColumn, 1)
  assert.equal(r.nameColumn, 0)
  assert.equal(r.rows.length, 2)
  assert.equal(r.rows[1]?.phoneRaw, '+62 812 9876 5432')
})
check('kutip, koma di dalam kutip, escape ""', () => {
  const r = parseContactTable('nama,no wa\n"Toko ""Maju"", Jaya",081234567890\n')
  assert.deepEqual(r.rows, [{ line: 2, name: 'Toko "Maju", Jaya', phoneRaw: '081234567890' }])
})
check('BOM + CRLF + baris kosong dilewati', () => {
  const r = parseContactTable('﻿Nama,WhatsApp\r\n\r\nBudi,081234567890\r\n,\r\n')
  assert.equal(r.hasHeader, true)
  assert.deepEqual(r.rows, [{ line: 3, name: 'Budi', phoneRaw: '081234567890' }])
})
check('kolom terbalik (nomor dulu) tanpa header', () => {
  const r = parseContactTable('081234567890,Budi\n081298765432,Siti')
  assert.equal(r.phoneColumn, 0)
  assert.equal(r.nameColumn, 1)
  assert.equal(r.rows[0]?.name, 'Budi')
})
check('kolom terbalik dengan header (No HP, Nama Pelanggan)', () => {
  const r = parseContactTable('No HP,Nama Pelanggan,Kota\n081234567890,Budi,Bandung')
  assert.equal(r.phoneColumn, 0)
  assert.equal(r.nameColumn, 1)
  assert.deepEqual(r.rows, [{ line: 2, name: 'Budi', phoneRaw: '081234567890' }])
})
check('satu kolom nomor saja → nama null', () => {
  const r = parseContactTable('081234567890\n081298765432')
  assert.equal(r.hasHeader, false)
  assert.equal(r.nameColumn, null)
  assert.equal(r.rows[0]?.name, null)
})
check('nama kosong di satu baris → null', () => {
  const r = parseContactTable('Nama,Nomor\n,081234567890')
  assert.equal(r.rows[0]?.name, null)
})
check('baris yang mirip header tapi berisi nomor valid → bukan header', () => {
  const r = parseContactTable('Nama Budi,081234567890\nSiti,081298765432')
  assert.equal(r.hasHeader, false)
  assert.equal(r.rows.length, 2)
})
check('teks kosong → tanpa baris', () => {
  const r = parseContactTable('   \n\n')
  assert.equal(r.rows.length, 0)
})

console.log('contacts/import-parse: buildImportPlan')

check('valid, tidak valid, duplikat dalam file (nama pertama non-kosong)', () => {
  const rows = parseContactTable(
    'Nama,Nomor\n,081234567890\nBudi,+62 812-3456-7890\nSiti,6.28123E+12\nAni,081298765432\n',
  ).rows
  const plan = buildImportPlan(rows)
  assert.equal(plan.totalRows, 4)
  assert.deepEqual(plan.valid, [
    { phone: '6281234567890', name: 'Budi' },
    { phone: '6281298765432', name: 'Ani' },
  ])
  assert.equal(plan.duplicatesInFile, 1)
  assert.equal(plan.invalid.length, 1)
  assert.equal(plan.invalid[0]?.line, 4)
  assert.equal(plan.invalid[0]?.raw, '6.28123E+12')
  assert.equal(plan.truncated, false)
})
check('maxRows memotong & menandai truncated', () => {
  const rows = Array.from({ length: 5 }, (_, i) => ({
    line: i + 1,
    name: null,
    phoneRaw: `08123456789${i}`,
  }))
  const plan = buildImportPlan(rows, { maxRows: 3 })
  assert.equal(plan.truncated, true)
  assert.equal(plan.totalRows, 5)
  assert.equal(plan.valid.length, 3)
})

console.log('contacts/import-parse: tag & util')

check('tag kosong → impor-YYYYMMDD', () => {
  assert.equal(normalizeImportTag('', '20261007'), 'impor-20261007')
  assert.equal(normalizeImportTag(undefined, '20261007'), 'impor-20261007')
  assert.equal(normalizeImportTag('  !!! ', '20261007'), 'impor-20261007')
})
check('tag di-slug: huruf kecil, spasi → -, karakter aneh dibuang', () => {
  assert.equal(normalizeImportTag('Pelanggan Lama 2024!', '20261007'), 'pelanggan-lama-2024')
  assert.equal(normalizeImportTag('vip:reseller_jkt', '20261007'), 'vip:reseller_jkt')
  assert.equal(normalizeImportTag('a'.repeat(60), '20261007').length, 40)
})
check('ymdInJakarta pakai zona WIB', () => {
  // 2026-10-06 18:30 UTC = 2026-10-07 01:30 WIB
  assert.equal(ymdInJakarta(new Date('2026-10-06T18:30:00Z')), '20261007')
})
check('maskImportPhone menyamarkan bagian tengah', () => {
  assert.equal(maskImportPhone('6281234567890'), '62812****7890')
  assert.equal(maskImportPhone('123'), '***')
})

console.log(`contacts/import-parse: ${passed} lulus`)
