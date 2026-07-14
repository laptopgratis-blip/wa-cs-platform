// Helper format angka & rupiah untuk UI Bahasa Indonesia.
const numberFormatter = new Intl.NumberFormat('id-ID')
const rupiahFormatter = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
})

export function formatNumber(value: number): string {
  return numberFormatter.format(value)
}

export function formatRupiah(value: number): string {
  return rupiahFormatter.format(value)
}

// Area tujuan pengiriman: "Kota — Kelurahan, Kecamatan" (mis. "Jakarta
// Selatan — Cipedak, Jagakarsa"). Kota saja ambigu untuk isi form ekspedisi;
// kode pos bisa dipakai beberapa kelurahan sekaligus. Nilai '-' dari master
// Komerce dianggap kosong.
export function formatShippingArea(o: {
  shippingCityName?: string | null
  shippingDistrictName?: string | null
  shippingSubdistrictName?: string | null
}): string | null {
  const detail = [o.shippingSubdistrictName, o.shippingDistrictName]
    .filter((p): p is string => Boolean(p && p !== '-'))
    .join(', ')
  const city = o.shippingCityName && o.shippingCityName !== '-' ? o.shippingCityName : null
  if (city && detail) return `${city} — ${detail}`
  return city ?? (detail || null)
}
