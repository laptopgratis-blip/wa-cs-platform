// Peta provinsi Indonesia → region/pulau. Dipakai warehouse-selector untuk
// prefilter kandidat gudang sebelum cost-compare (hemat kuota RajaOngkir):
// gudang di region yang sama dengan tujuan diprioritaskan.
//
// Nama provinsi mengikuti format Komerce (RajaongkirDestination.province_name),
// mis. "DKI JAKARTA", "JAWA BARAT", "SUMATERA UTARA", "KEPULAUAN RIAU".
// Match pakai keyword-contains supaya toleran terhadap variasi penulisan
// (mis. "DI YOGYAKARTA" vs "DAERAH ISTIMEWA YOGYAKARTA").

export type RegionCode =
  | 'JAWA'
  | 'SUMATERA'
  | 'KALIMANTAN'
  | 'SULAWESI'
  | 'BALINUSRA'
  | 'MALUKU'
  | 'PAPUA'
  | 'LAINNYA'

// Urutan penting: keyword yang lebih spesifik/aman dicek dulu. Tiap entri
// = [keyword uppercase, region]. Provinsi Jawa tidak mengandung keyword region
// lain, jadi aman dicek belakangan lewat JAWA/JAKARTA/YOGYAKARTA/BANTEN.
const RULES: Array<[string, RegionCode]> = [
  ['KALIMANTAN', 'KALIMANTAN'],
  ['SULAWESI', 'SULAWESI'],
  ['GORONTALO', 'SULAWESI'],
  ['MALUKU', 'MALUKU'],
  ['PAPUA', 'PAPUA'],
  ['SUMATERA', 'SUMATERA'],
  ['SUMATRA', 'SUMATERA'],
  ['ACEH', 'SUMATERA'],
  ['RIAU', 'SUMATERA'],
  ['JAMBI', 'SUMATERA'],
  ['BENGKULU', 'SUMATERA'],
  ['LAMPUNG', 'SUMATERA'],
  ['BANGKA', 'SUMATERA'],
  ['BELITUNG', 'SUMATERA'],
  ['BALI', 'BALINUSRA'],
  ['NUSA TENGGARA', 'BALINUSRA'],
  ['JAKARTA', 'JAWA'],
  ['JAWA', 'JAWA'],
  ['YOGYAKARTA', 'JAWA'],
  ['BANTEN', 'JAWA'],
]

export function regionOfProvince(provinceName: string | null | undefined): RegionCode {
  if (!provinceName) return 'LAINNYA'
  const p = provinceName.toUpperCase()
  for (const [kw, region] of RULES) {
    if (p.includes(kw)) return region
  }
  return 'LAINNYA'
}
