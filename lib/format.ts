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
