// Parser hasil halaman mutasi KlikBCA Individual.
// Layout BCA: tabel HTML lama dengan baris alternating bgcolor #e0e0e0 / #f0f0f0.
// Kolom: [Tgl, Keterangan, Cab, Mutasi (CR/DB), Saldo].
//
// Toleran terhadap variasi minor (whitespace, urutan kelas) — kalau BCA ubah
// struktur, fallback heuristik di parseLoose() akan dipakai.
const cheerio = require('cheerio')

const ROW_BG_COLORS = new Set(['#e0e0e0', '#f0f0f0', '#E0E0E0', '#F0F0F0'])

function cleanText(s) {
  return (s || '')
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseAmount(s) {
  // BCA pakai format Indonesia: "1.234.567,89" → 1234567.89
  // Tapi di mutasi sering tampil "1,234,567.89" juga. Detect by last separator.
  const cleaned = cleanText(s).replace(/[^\d,.\-]/g, '')
  if (!cleaned) return null
  const lastDot = cleaned.lastIndexOf('.')
  const lastComma = cleaned.lastIndexOf(',')
  let normalized
  if (lastComma > lastDot) {
    // Indonesian: ribuan = '.', desimal = ','
    normalized = cleaned.replace(/\./g, '').replace(',', '.')
  } else {
    // English: ribuan = ',', desimal = '.'
    normalized = cleaned.replace(/,/g, '')
  }
  const n = parseFloat(normalized)
  return isFinite(n) ? n : null
}

function parseMutations(html) {
  const $ = cheerio.load(html)
  const mutations = []

  $('tr').each((_, row) => {
    const $row = $(row)
    const bg = $row.attr('bgcolor')
    if (!bg || !ROW_BG_COLORS.has(bg)) return

    const cells = $row.find('td')
    if (cells.length < 4) return

    const dateText = cleanText($(cells[0]).text())
    if (!/^\d{2}\/\d{2}(\/\d{2,4})?$/.test(dateText)) return

    const description = cleanText($(cells[1]).text())
    // Cabang sering kosong / dash. Mutation cell biasanya cells[3], saldo cells[4].
    const branch = cells.length >= 5 ? cleanText($(cells[2]).text()) : null
    const mutationCellIdx = cells.length >= 5 ? 3 : 2
    const balanceCellIdx = cells.length >= 5 ? 4 : 3

    const mutationRaw = cleanText($(cells[mutationCellIdx]).text())
    // Pattern: "<amount> CR" / "<amount>CR" / "<amount> DB"
    const match = mutationRaw.match(/^([\d.,]+)\s*(CR|DB)$/i)
    if (!match) return

    const amount = parseAmount(match[1])
    if (amount === null) return
    const type = match[2].toUpperCase()

    const balanceRaw =
      cells.length > balanceCellIdx
        ? cleanText($(cells[balanceCellIdx]).text())
        : ''
    const balance = parseAmount(balanceRaw)

    mutations.push({
      date: normalizeDate(dateText),
      description,
      branch: branch || null,
      amount,
      type,
      balance,
      rawHtml: $.html(row),
    })
  })

  return mutations
}

// Normalisasi tanggal BCA (DD/MM/YY atau DD/MM atau DD/MM/YYYY) ke string
// "DD/MM/YYYY" untuk hashing yang konsisten. Kalau tahun 2 digit → 20xx.
function normalizeDate(s) {
  const parts = s.split('/')
  if (parts.length === 2) {
    const [d, m] = parts
    return `${d}/${m}/${new Date().getFullYear()}`
  }
  if (parts.length === 3) {
    let [d, m, y] = parts
    if (y.length === 2) y = `20${y}`
    return `${d}/${m}/${y}`
  }
  return s
}

// Parse account info (nomor + nama) dari halaman mutasi atau halaman utama.
// BCA tampilkan di header tabel: "Nomor Rekening: 0123456789  Nama: BUDI...".
function extractAccountInfo(html) {
  const $ = cheerio.load(html)
  let number = null
  let name = null

  const allText = cleanText($('body').text())

  const numMatch = allText.match(/(\d{10,16})/)
  if (numMatch) number = numMatch[1]

  // Coba beberapa pattern nama
  const nameMatch =
    allText.match(/Nama\s*:?\s*([A-Z][A-Z\s.]{3,40})/) ||
    allText.match(/Pemilik\s*:?\s*([A-Z][A-Z\s.]{3,40})/)
  if (nameMatch) {
    name = cleanText(nameMatch[1])
  }

  return number ? { number, name } : null
}

// Cek apakah halaman setelah submit form mutasi mengindikasikan "tidak ada
// transaksi" — supaya kita tidak mark sukses dengan 0 mutation kalau BCA
// sebenarnya error / state lain.
function isEmptyMutationPage(html) {
  const lower = html.toLowerCase()
  return (
    lower.includes('tidak ada data') ||
    lower.includes('no data') ||
    lower.includes('belum ada transaksi') ||
    lower.includes('tidak ada transaksi')
  )
}

module.exports = { parseMutations, extractAccountInfo, isEmptyMutationPage }
