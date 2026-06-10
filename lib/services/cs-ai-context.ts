// CS AI Context Builder — bangun blok teks untuk inject ke system prompt
// CS AI saat user mengaktifkan integrasi Katalog Produk / Hitung Ongkir.
//
// Dipanggil dari /api/internal/knowledge/[sessionId] (per pesan masuk).
// Hot path: HARUS cepat (<150ms). Strategi:
//   - Single DB query per fitur, batasi LIMIT.
//   - Raja Ongkir dicache 6 jam (lihat shippingCostCache di rajaongkir.ts).
//   - Detect kota di pesan customer pakai regex + searchDestinations (cached
//     24 jam fetch-level oleh Next).
//
// Reuse rule existing (tidak duplikasi logic):
//   - flash sale aktif: pakai isFlashSaleActive() dari order-pricing.ts
//   - zone subsidy   : pakai findMatchingZone() dari order-pricing.ts
import { prisma } from '@/lib/prisma'
import {
  findMatchingZone,
  isFlashSaleActive,
} from '@/lib/services/order-pricing'
import {
  calculateShippingCost,
  searchDestinations,
  type RajaongkirDestination,
  type ShippingService,
} from '@/lib/services/rajaongkir'

const PRODUCT_LIMIT = 20
const DEFAULT_COURIERS = ['jne', 'sicepat', 'jnt', 'anteraja']

// Komerce search return level subdistrict, di-rank by full-text terhadap
// SEMUA field (subdistrict_name, city_name, province_name). Akibatnya untuk
// query nama kota umum, kelurahan-kelurahan di provinsi LAIN bisa rank lebih
// dulu daripada kota target. Contoh: search "surabaya" → "Surabaya Baru,
// Lampung Tengah" (kelurahan) rank #1 sebelum "Surabaya, Jawa Timur" (kota).
//
// SEARCH_LIMIT besar supaya kota target ada di hasil; pickBestDestination
// kemudian filter pakai city_name match.
const DESTINATION_SEARCH_LIMIT = 30

// Alias nama kota populer yang sering dipanggil dengan nickname.
// Saat candidate dari extractCityCandidates match key, kita pakai value
// untuk search ke Komerce (yang pakai nama resmi).
const CITY_ALIASES: Record<string, string> = {
  jogja: 'yogyakarta',
  yogya: 'yogyakarta',
  solo: 'surakarta',
  dki: 'jakarta',
  jakpus: 'jakarta pusat',
  jaksel: 'jakarta selatan',
  jakbar: 'jakarta barat',
  jaktim: 'jakarta timur',
  jakut: 'jakarta utara',
  bandar: 'bandar lampung',
}

// Pilih destinasi terbaik dari list hasil Komerce. Prioritas:
//   1. city_name match exact (case-insensitive) — paling pas dengan intent.
//   2. city_name startsWith query (cover "Jakarta" vs "Jakarta Selatan"
//      atau "Bandar Lampung" vs "Bandar").
//   3. Subdistrict yang masih di-PROVINSI yg city_name-nya match (edge case).
//   4. Fallback: hasil pertama.
//
// Tujuan: hindari kasus search "surabaya" terpilih ke kelurahan "Surabaya"
// di Lampung Tengah, padahal user maksud Surabaya, Jawa Timur.
function pickBestDestination(
  query: string,
  destinations: RajaongkirDestination[],
): RajaongkirDestination | null {
  if (destinations.length === 0) return null
  const q = query.toUpperCase().trim()
  return (
    destinations.find((d) => d.city_name?.toUpperCase() === q) ??
    destinations.find((d) => d.city_name?.toUpperCase().startsWith(q)) ??
    destinations.find((d) => d.city_name?.toUpperCase().includes(q)) ??
    destinations[0]
  )
}

// ─── PRODUCT CATALOG ────────────────────────────────────────────────────

// Bangun blok katalog produk untuk system prompt. Format markdown ringkas
// supaya hemat token. Max 20 produk aktif, urut by `order` asc lalu createdAt.
//
// Flash sale di-apply otomatis kalau applyFlashSaleDiscount=true di integrasi.
export async function formatProductCatalogForPrompt(
  userId: string,
  options: { applyFlashSale: boolean },
): Promise<string> {
  const products = await prisma.product.findMany({
    where: { userId, isActive: true },
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    take: PRODUCT_LIMIT,
    include: {
      variants: {
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
      },
    },
  })

  if (products.length === 0) return ''

  const lines: string[] = ['', '## Katalog Produk (live)']
  lines.push(
    'Pakai info berikut untuk jawab pertanyaan customer tentang produk, harga, stok, atau varian. JANGAN bilang "saya tanya admin dulu" — info ini sudah lengkap.',
    '',
  )

  let hasFlash = false
  for (const p of products) {
    const flash = options.applyFlashSale && isFlashSaleActive(p)
    if (flash) hasFlash = true
    const effectivePrice =
      flash && p.flashSalePrice != null ? p.flashSalePrice : p.price
    const priceStr = formatRupiah(effectivePrice)
    // Sertakan batas waktu flash (WIB) supaya AI bisa jawab "promo sampai
    // kapan?" dengan akurat, bukan ngarang / bilang tidak tahu.
    const flashStr =
      flash && p.flashSalePrice != null
        ? ` ~~${formatRupiah(p.price)}~~ 🔥 FLASH SALE${
            p.flashSaleEndAt ? ` s.d. ${formatWib(p.flashSaleEndAt)}` : ''
          }`
        : ''
    const stockStr = formatStock(p.stock)
    const weightStr = p.weightGrams > 0 ? ` (${p.weightGrams}g)` : ''

    lines.push(`- **${p.name}** — ${priceStr}${flashStr} — ${stockStr}${weightStr}`)
    if (p.description?.trim()) {
      lines.push(`  ${truncate(p.description.trim(), 180)}`)
    }
    if (p.variants.length > 0) {
      const variantStr = p.variants
        .map((v) => `${v.name} ${formatRupiah(v.price)}${v.stock != null ? ` [stok ${v.stock}]` : ''}`)
        .join(' · ')
      lines.push(`  Varian: ${variantStr}`)
    }
  }

  lines.push('')
  if (hasFlash) {
    lines.push(
      '**Flash sale**: untuk produk bertanda 🔥, sebutkan harga promo + harga normal (coret) secara PROAKTIF saat membahas produk itu, dan sebutkan batas waktunya supaya customer tahu promonya terbatas. JANGAN menjanjikan harga flash untuk pembelian di luar periode tersebut.',
    )
  }
  lines.push(
    '**Catatan**: kalau customer tanya produk yang tidak ada di daftar di atas, bilang produk itu belum tersedia / sudah habis — JANGAN ngarang harga.',
  )

  return lines.join('\n')
}

// Format waktu dalam zona Asia/Jakarta untuk prompt — server jalan di UTC,
// customer baca WIB.
function formatWib(d: Date): string {
  return (
    new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Jakarta',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d) + ' WIB'
  )
}

function formatRupiah(n: number): string {
  return `Rp ${n.toLocaleString('id-ID')}`
}

function formatStock(stock: number | null): string {
  if (stock == null) return 'stok ready'
  if (stock <= 0) return '⚠️ HABIS'
  if (stock <= 5) return `tinggal ${stock}`
  return 'stok ready'
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max - 1).trimEnd() + '…'
}

// ─── SHIPPING ───────────────────────────────────────────────────────────

// Bangun blok instruksi ongkir umum: origin, kurir aktif, daftar zona subsidi.
// Ini di-inject saat shippingCalcEnabled=true, regardless of message content,
// supaya AI tahu "saya bisa hitung ongkir; minta info kota tujuan kalau perlu".
export async function formatShippingInstructionForPrompt(
  userId: string,
  options: { applySubsidyRules: boolean },
): Promise<string> {
  const [profile, zones] = await Promise.all([
    prisma.userShippingProfile.findUnique({
      where: { userId },
      select: {
        originCityName: true,
        originProvinceName: true,
        enabledCouriers: true,
        defaultWeightGrams: true,
      },
    }),
    options.applySubsidyRules
      ? prisma.shippingZone.findMany({
          where: {
            userId,
            isActive: true,
            subsidyType: { not: 'NONE' },
          },
          orderBy: { priority: 'desc' },
          take: 5,
          select: {
            name: true,
            matchType: true,
            cityNames: true,
            provinceNames: true,
            subsidyType: true,
            subsidyValue: true,
            minimumOrder: true,
          },
        })
      : Promise.resolve([]),
  ])

  if (!profile?.originCityName) return ''

  const lines: string[] = ['', '## Info Ongkir (otomatis)']
  const courierStr =
    profile.enabledCouriers.length > 0
      ? profile.enabledCouriers.map((c) => c.toUpperCase()).join(', ')
      : 'JNE, J&T, SiCepat, AnterAja'
  lines.push(
    `Origin pengiriman: **${profile.originCityName}**${profile.originProvinceName ? `, ${profile.originProvinceName}` : ''}.`,
    `Kurir tersedia: ${courierStr}.`,
  )

  if (zones.length > 0) {
    lines.push('', '**Promo ongkir aktif (otomatis ke-apply):**')
    for (const z of zones) {
      const target =
        z.matchType === 'ALL'
          ? 'semua wilayah'
          : z.matchType === 'CITY'
            ? `${z.cityNames.slice(0, 3).join(', ')}${z.cityNames.length > 3 ? ` +${z.cityNames.length - 3} kota` : ''}`
            : `${z.provinceNames.slice(0, 3).join(', ')}${z.provinceNames.length > 3 ? ` +${z.provinceNames.length - 3} prov` : ''}`
      const subsidy = describeSubsidy(z.subsidyType, z.subsidyValue)
      const minOrder = z.minimumOrder
        ? ` (min order ${formatRupiah(z.minimumOrder)})`
        : ''
      lines.push(`- ${z.name}: ${subsidy} untuk ${target}${minOrder}`)
    }
  }

  lines.push(
    '',
    '**Saat customer tanya ongkir:**',
    '- Kalau customer SUDAH sebut kota/kabupaten tujuan di pesan, info ongkir sudah otomatis kehitung & ada di bagian "Ongkir ke ..." di bawah (kalau muncul). Sebutkan harga ongkir + estimasi + promo yang berlaku.',
    '- Kalau BELUM jelas kotanya, tanya dengan singkat: "Kirim ke kota/kabupaten mana ya kak?" — JANGAN ngarang nominal ongkir.',
  )

  return lines.join('\n')
}

function describeSubsidy(type: string, value: number): string {
  if (type === 'FREE') return 'Gratis ongkir'
  if (type === 'FLAT_AMOUNT') return `Subsidi ${formatRupiah(value)}`
  if (type === 'PERCENT') return `Diskon ${value}% ongkir`
  return ''
}

// Detect kota/kabupaten yang disebut customer di pesan. Strategi gabungan:
//   1. Pattern global setelah trigger word ("kirim ke X", "ongkir ke X",
//      "alamat saya X", "tujuan X"). Trigger termasuk "ke" / "di" standalone.
//   2. Match terhadap daftar kota populer Indonesia (cover misal "ongkir
//      bandung").
//   3. Comma-separated locations ("Slogohimo, Wonogiri") — capture last comma
//      part sebagai kandidat (biasanya kota/kabupaten).
// Return: candidate locations untuk di-resolve via Raja Ongkir, max 3 buah.
//
// Daftar kota/kab populer Indonesia untuk fallback match. Lowercase.
// Cover 100+ kota — kalau customer sebut kota lain, strategy #1/#3 yang nangkep.
const POPULAR_CITIES = [
  // Jabodetabek
  'jakarta', 'bekasi', 'tangerang', 'depok', 'bogor', 'cikarang',
  // Jawa Barat
  'bandung', 'cimahi', 'sukabumi', 'cirebon', 'tasikmalaya', 'garut',
  'cianjur', 'subang', 'karawang', 'purwakarta', 'sumedang', 'ciamis',
  'banjar', 'kuningan', 'majalengka', 'indramayu', 'pangandaran',
  // Jawa Tengah & DIY
  'semarang', 'solo', 'surakarta', 'yogyakarta', 'jogja', 'magelang',
  'kudus', 'jepara', 'demak', 'salatiga', 'klaten', 'sragen', 'wonogiri',
  'karanganyar', 'sukoharjo', 'boyolali', 'temanggung', 'wonosobo',
  'purworejo', 'kebumen', 'banjarnegara', 'banyumas', 'cilacap',
  'purbalingga', 'brebes', 'pemalang', 'batang', 'kendal', 'blora',
  'pati', 'rembang', 'grobogan', 'bantul', 'sleman', 'kulon progo',
  'gunungkidul', 'gunung kidul',
  // Jawa Timur
  'surabaya', 'malang', 'sidoarjo', 'gresik', 'kediri', 'mojokerto',
  'pasuruan', 'probolinggo', 'jember', 'banyuwangi', 'madiun', 'kediri',
  'blitar', 'tulungagung', 'trenggalek', 'pacitan', 'ponorogo', 'magetan',
  'ngawi', 'bojonegoro', 'tuban', 'lamongan', 'jombang', 'nganjuk',
  'lumajang', 'bondowoso', 'situbondo', 'pamekasan', 'sumenep', 'sampang',
  'bangkalan',
  // Banten
  'serang', 'cilegon', 'tigaraksa', 'pandeglang', 'lebak',
  // Bali NTB NTT
  'denpasar', 'badung', 'gianyar', 'tabanan', 'klungkung', 'bangli',
  'karangasem', 'buleleng', 'jembrana', 'mataram', 'lombok', 'sumbawa',
  'bima', 'dompu', 'kupang', 'maumere', 'ende',
  // Sumatera
  'medan', 'binjai', 'pematangsiantar', 'tebing tinggi', 'padangsidempuan',
  'pekanbaru', 'dumai', 'pelalawan',
  'palembang', 'prabumulih', 'lubuklinggau', 'pagaralam',
  'lampung', 'bandar lampung', 'metro',
  'jambi', 'bengkulu', 'aceh', 'banda aceh', 'lhokseumawe', 'sabang',
  'langsa', 'padang', 'bukittinggi', 'pariaman', 'payakumbuh', 'solok',
  'pangkal pinang', 'pangkalpinang', 'tanjungpinang', 'batam',
  // Kalimantan
  'pontianak', 'singkawang', 'sintang',
  'banjarmasin', 'banjarbaru', 'martapura',
  'samarinda', 'balikpapan', 'bontang', 'tarakan',
  'palangkaraya', 'palangka raya', 'sampit',
  // Sulawesi
  'makassar', 'manado', 'bitung', 'tomohon', 'kotamobagu',
  'palu', 'poso', 'kendari', 'baubau',
  'gorontalo', 'mamuju', 'majene',
  // Maluku & Papua
  'ambon', 'ternate', 'tidore', 'sorong', 'jayapura', 'merauke', 'biak',
  // Tengah lain
  'purwokerto', 'pekalongan', 'tegal', 'klaten',
] as const

// Trigger kata yang biasa muncul sebelum nama kota/lokasi.
// "ke" dan "di" wajib bound dengan \b di kiri & kanan supaya tidak match
// di dalam kata lain (mis. "ditanya", "ketika").
const TRIGGER_RE =
  /\b(?:kirim(?:in|nya)?(?:\s+ke)?|ongkir(?:\s+ke)?|dikirim(?:\s+ke)?|alamat(?:\s+ke|\s+saya|nya)?|tujuan(?:\s+ke)?|destinasi(?:\s+ke)?|sampe(?:\s+ke)?|sampai(?:\s+ke)?|tiba(?:\s+di)?|untuk(?:\s+daerah|\s+kota|\s+kab(?:upaten)?)?|kota|kab(?:upaten)?|ke|di|to)\s+([a-zA-ZÀ-ſ][a-zA-ZÀ-ſ .']{2,40})/gi

// Filler/stopword di-strip dari hasil capture supaya tidak ikut jadi candidate.
const STOPWORD_TAIL =
  /\s+(dong|ya|kak|gan|min|donk|aja|saja|gimana|berapa|brp|kah|nya|sini|sana|situ|aku|saya|kakak|abang|mas|mba|mbak|bos|pak|bu|kalo|kalau|kalo|kapan|nih|sih|tuh|udah|sudah|atau|atau)\b.*$/i

const STOPWORD_HEAD =
  /^(?:itu|ini|nya|yg|yang|dari|untuk|buat|nih|sih|tuh)\s+/i

function cleanCandidate(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(STOPWORD_TAIL, '')
    .replace(STOPWORD_HEAD, '')
    .replace(/[.,;!?]+$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

// Kata umum yang JANGAN dipakai sebagai candidate kota (false positive umum).
const NON_CITY_WORDS = new Set([
  'sini', 'sana', 'situ', 'rumah', 'kantor', 'kost', 'kos', 'apartemen',
  'kampus', 'sekolah', 'mall', 'toko', 'kakak', 'admin', 'mereka',
  'tempat', 'gudang', 'area', 'daerah', 'sana', 'sini', 'hari', 'jam',
  'minggu', 'bulan', 'tahun', 'pagi', 'siang', 'sore', 'malam',
])

function isPlausibleCity(s: string): boolean {
  if (s.length < 3 || s.length > 40) return false
  if (NON_CITY_WORDS.has(s)) return false
  // Reject candidate yang isinya angka saja atau dominan angka.
  if (/^\d+$/.test(s)) return false
  return true
}

export function extractCityCandidates(message: string): string[] {
  const msg = message.toLowerCase()
  const candidates = new Set<string>()

  // Strategy 1: trigger pattern (global match — ambil semua occurrence).
  TRIGGER_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = TRIGGER_RE.exec(message)) !== null) {
    if (!m[1]) continue
    const cleaned = cleanCandidate(m[1])
    if (isPlausibleCity(cleaned)) candidates.add(cleaned)
    if (candidates.size >= 4) break
  }

  // Strategy 2: popular cities (substring match dgn word boundary).
  for (const city of POPULAR_CITIES) {
    const re = new RegExp(`\\b${city}\\b`, 'i')
    if (re.test(msg)) candidates.add(city)
    if (candidates.size >= 4) break
  }

  // Strategy 3: pesan dengan koma — capture segment terakhir (umumnya kota
  // di alamat "Jl. X, RT Y, Z, Kota").
  if (candidates.size === 0 && message.includes(',')) {
    const parts = message
      .split(',')
      .map((p) => cleanCandidate(p))
      .filter(isPlausibleCity)
    // Ambil 2 segment terakhir (biasanya kabupaten + kota / kota + provinsi).
    for (const p of parts.slice(-2)) {
      candidates.add(p)
    }
  }

  return Array.from(candidates).slice(0, 3)
}

// Resolve city candidate → Raja Ongkir destination → hit cost → apply zone
// subsidy → format hasil. Kalau tidak ada candidate yang cocok, return null
// supaya tidak inject block kosong.
export async function resolveShippingFromMessage(
  userId: string,
  message: string,
  options: { applySubsidyRules: boolean },
): Promise<string | null> {
  const candidates = extractCityCandidates(message)
  if (candidates.length === 0) return null

  const profile = await prisma.userShippingProfile.findUnique({
    where: { userId },
    select: {
      originCityId: true,
      originCityName: true,
      enabledCouriers: true,
      defaultWeightGrams: true,
    },
  })
  if (!profile?.originCityId) return null

  const couriers =
    profile.enabledCouriers.length > 0
      ? profile.enabledCouriers
      : DEFAULT_COURIERS

  // Coba candidate satu per satu. Ambil yang match terbaik destinationnya.
  for (const candidate of candidates) {
    // Resolve alias dulu — "jogja" → "yogyakarta" supaya search ke Komerce
    // pakai nama resmi (city_name resmi yang akan kita match).
    const searchQuery = CITY_ALIASES[candidate] ?? candidate

    const destinations = await searchDestinations(
      searchQuery,
      DESTINATION_SEARCH_LIMIT,
    )
    if (destinations.length === 0) continue

    // Pakai pickBestDestination supaya tidak nyasar ke kelurahan beda
    // provinsi yang kebetulan punya nama mirip (mis. "Surabaya, Lampung
    // Tengah" untuk query "surabaya").
    const dest = pickBestDestination(searchQuery, destinations)
    if (!dest) continue

    const services = await calculateShippingCost({
      origin: Number(profile.originCityId),
      destination: dest.id,
      weight: profile.defaultWeightGrams,
      couriers,
    })
    if (services.length === 0) continue

    return formatShippingResult({
      candidate,
      destination: dest.label,
      cityName: dest.city_name,
      provinceName: dest.province_name,
      origin: profile.originCityName ?? 'origin',
      weight: profile.defaultWeightGrams,
      services,
      userId,
      applySubsidyRules: options.applySubsidyRules,
    })
  }

  return null
}

async function formatShippingResult(input: {
  candidate: string
  destination: string
  cityName: string
  provinceName: string
  origin: string
  weight: number
  services: ShippingService[]
  userId: string
  applySubsidyRules: boolean
}): Promise<string> {
  const lines: string[] = ['', `## Ongkir ke ${input.cityName}`]
  lines.push(
    `Tujuan terdeteksi: **${input.destination}** (dari kata "${input.candidate}").`,
    `Origin: ${input.origin}. Estimasi berat: ${input.weight}g.`,
    '',
  )

  // Tampilkan max 4 service termurah supaya prompt tidak bengkak.
  const sortedServices = [...input.services]
    .sort((a, b) => a.cost - b.cost)
    .slice(0, 4)

  // Apply subsidy?
  let subsidy = 0
  let zoneNote = ''
  if (input.applySubsidyRules) {
    const zone = await findMatchingZone({
      userId: input.userId,
      cityName: input.cityName,
      provinceName: input.provinceName,
    })
    if (zone) {
      // Ambil ongkir termurah sebagai basis subsidi (untuk display).
      const baseCost = sortedServices[0]?.cost ?? 0
      if (zone.subsidyType === 'FREE') subsidy = baseCost
      else if (zone.subsidyType === 'FLAT_AMOUNT')
        subsidy = Math.min(zone.subsidyValue, baseCost)
      else if (zone.subsidyType === 'PERCENT')
        subsidy = Math.round((baseCost * zone.subsidyValue) / 100)

      if (subsidy > 0) {
        zoneNote = `**${zone.name}** — ${describeSubsidy(zone.subsidyType, zone.subsidyValue)}${zone.minimumOrder ? ` (min order ${formatRupiah(zone.minimumOrder)})` : ''}`
      }
    }
  }

  lines.push('**Pilihan kurir (sebelum subsidi):**')
  for (const s of sortedServices) {
    lines.push(
      `- ${s.code.toUpperCase()} ${s.service} (${s.description}): ${formatRupiah(s.cost)} — ${s.etd}`,
    )
  }

  if (zoneNote) {
    lines.push('', `**Promo ke-apply otomatis:** ${zoneNote}`)
    const cheapest = sortedServices[0]
    if (cheapest) {
      const finalCost = Math.max(0, cheapest.cost - subsidy)
      lines.push(
        `Ongkir final termurah (${cheapest.code.toUpperCase()} ${cheapest.service}): **${formatRupiah(finalCost)}**${subsidy > 0 && finalCost === 0 ? ' (GRATIS!)' : ''} (asalnya ${formatRupiah(cheapest.cost)}, subsidi ${formatRupiah(subsidy)})`,
      )
    }
  }

  lines.push(
    '',
    `**Sebutkan info ongkir di atas ke customer.** Berat ${input.weight}g = estimasi rata-rata; kalau order banyak/berat besar, ongkir final bisa lebih tinggi dan akan dihitung lagi saat customer isi form order.`,
  )

  return lines.join('\n')
}
