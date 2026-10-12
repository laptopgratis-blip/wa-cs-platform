// Filter pencarian daftar Landing Page (PURE, tanpa prisma) — dipakai
// LpManager. Seluruh LP user sudah dimuat di klien, jadi cukup filter lokal.
//
// Aturan: tidak peka huruf besar/kecil & aksen; ketikan dipecah per kata
// (semua karakter non-huruf/angka jadi pemisah) dan SEMUA kata harus muncul di
// judul atau slug, urutan bebas. Menempel alamat LP ("/p/slug" atau URL
// penuh) mencari slug-nya saja.

export interface LandingPageSearchable {
  title: string
  slug: string
}

// Samakan bentuk teks: buang aksen (NFKD + combining marks), huruf kecil.
function fold(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

// "https://hulao.id/p/slug-saya?utm=x#top" → "slug-saya". Bukan alamat LP →
// kembalikan apa adanya.
function stripLpAddress(query: string): string {
  const match = query.match(/\/p\/([^\s?#/]+)/i)
  return match ? match[1] : query
}

function tokenize(query: string): string[] {
  return fold(stripLpAddress(query))
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
}

/** true bila ketikan memuat minimal satu kata bermakna (selaras dgn filter). */
export function hasSearchTerms(query: string): boolean {
  return tokenize(query).length > 0
}

export function filterLandingPages<T extends LandingPageSearchable>(
  pages: readonly T[],
  query: string,
): T[] {
  const words = tokenize(query)
  if (words.length === 0) return [...pages]
  return pages.filter((p) => {
    const haystack = fold(`${p.title} ${p.slug}`)
    return words.every((w) => haystack.includes(w))
  })
}
