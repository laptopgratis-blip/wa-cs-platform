// Isi fitur per paket LP untuk /pricing — highlight kartu + tabel
// perbandingan lengkap. Modul PURE (tanpa prisma) supaya bisa di-import
// client component.
//
// Angka & flag TIDAK di-hardcode di sini: entitlement tiap paket dihitung
// server dari sumber enforcement asli (lib/services/plan-entitlements.ts),
// limit Sistem Order diambil dari konstanta validasi yang dipakai API.
// Kalau menambah baris, pastikan memang ada gate/limit di kode — halaman ini
// janji ke pembeli, jangan sampai over-promise.
import { BANK_ACCOUNT_LIMIT_PER_USER } from '@/lib/validations/bank-account'
import { EBOOK_LIMIT_PER_USER, EBOOK_MAX_BYTES } from '@/lib/validations/ebook'
import { LP_GENERATE_MIN_BALANCE } from '@/lib/validations/lp-generate'
import { PIXEL_INTEGRATION_LIMIT_PER_USER } from '@/lib/validations/pixel-integration'
import {
  PRODUCT_IMAGES_LIMIT,
  PRODUCT_LIMIT_PER_USER,
  VARIANT_LIMIT_PER_PRODUCT,
} from '@/lib/validations/product'
import { SHIPPING_ZONE_LIMIT_PER_USER } from '@/lib/validations/shipping-zone'
import { WAREHOUSE_LIMIT_PER_USER } from '@/lib/validations/warehouse'

// Hak satu paket — sudah final (hasil gate asli), UI tinggal render.
export interface PlanEntitlement {
  maxLp: number
  maxStorageMB: number
  maxImageSizeMB: number
  // Per landing page per bulan kalender (bukan total akun).
  maxVisitorMonth: number
  // LpUpgradePackage.canUseOrderSystem — flag DB, bukan nama tier.
  orderSystem: boolean
  // null = tanpa batas.
  orderFormLimit: number | null
  hostAi: boolean
  lpLab: boolean
}

export interface PlanColumn {
  id: string
  name: string
  tier: string
  entitlement: PlanEntitlement
}

// true = termasuk, false = tidak, string = termasuk dengan keterangan.
export type FeatureValue = boolean | string

export interface FeatureRow {
  key: string
  label: string
  hint?: string
  // Sejajar urutan `plans` yang dioper ke buildFeatureSections.
  values: FeatureValue[]
}

export interface FeatureSection {
  key: string
  title: string
  description?: string
  rows: FeatureRow[]
}

export interface PlanHighlight {
  key: string
  label: string
  value?: string
  detail?: string
  included: boolean
}

const TOKEN_PER_USE = 'Bayar token per pakai'

function fmt(n: number): string {
  return n.toLocaleString('id-ID')
}

function orderFormLabel(limit: number | null): string {
  return limit == null ? 'Tanpa batas' : `Maks ${fmt(limit)}`
}

// Daftar ringkas di kartu plan — kuota dulu, lalu fitur pembeda.
export function buildPlanHighlights(e: PlanEntitlement): PlanHighlight[] {
  const formText =
    e.orderFormLimit == null
      ? 'form order tanpa batas'
      : `maks ${fmt(e.orderFormLimit)} form order`
  return [
    {
      key: 'lp-count',
      label: 'Landing Page',
      value: fmt(e.maxLp),
      included: true,
    },
    {
      key: 'storage',
      label: 'Storage gambar LP',
      value: `${fmt(e.maxStorageMB)} MB`,
      included: true,
    },
    {
      key: 'image-size',
      label: 'Maks per gambar LP',
      value: `${fmt(e.maxImageSizeMB)} MB`,
      included: true,
    },
    {
      key: 'visitor',
      label: 'Kunjungan per halaman',
      value: `${fmt(e.maxVisitorMonth)}/bulan`,
      included: true,
    },
    {
      key: 'ai-generate',
      label: 'Bikin landing page dengan AI',
      detail: `Bayar token per pakai, saldo minimal ${fmt(LP_GENERATE_MIN_BALANCE)} token`,
      included: true,
    },
    {
      key: 'order-system',
      label: 'Sistem Order',
      detail: e.orderSystem
        ? `Produk, ${formText}, ongkir otomatis, follow-up WhatsApp`
        : undefined,
      included: e.orderSystem,
    },
    {
      key: 'host-ai',
      label: 'Host AI (Live Shopping)',
      detail: e.hostAi
        ? 'Bikin host virtual sendiri, bayar token per pakai'
        : undefined,
      included: e.hostAi,
    },
    {
      key: 'lp-lab',
      label: 'LP Lab',
      detail: e.lpLab
        ? 'Analitik, heatmap, skor halaman, optimasi AI'
        : undefined,
      included: e.lpLab,
    },
  ]
}

// Helper baris: nilai per paket dari predikat entitlement.
function rowOf(
  plans: PlanColumn[],
  key: string,
  label: string,
  hint: string | undefined,
  value: (e: PlanEntitlement) => FeatureValue,
): FeatureRow {
  return { key, label, hint, values: plans.map((p) => value(p.entitlement)) }
}

function landingPageSection(plans: PlanColumn[]): FeatureSection {
  return {
    key: 'landing-page',
    title: 'Landing Page',
    rows: [
      rowOf(
        plans,
        'lp-count',
        'Jumlah landing page',
        'Dihitung dari semua halaman, termasuk yang masih draft.',
        (e) => fmt(e.maxLp),
      ),
      rowOf(
        plans,
        'storage',
        'Storage gambar landing page',
        'Total ukuran gambar yang kamu unggah ke pustaka gambar landing page.',
        (e) => `${fmt(e.maxStorageMB)} MB`,
      ),
      rowOf(
        plans,
        'image-size',
        'Ukuran maksimal per gambar landing page',
        undefined,
        (e) => `${fmt(e.maxImageSizeMB)} MB`,
      ),
      rowOf(
        plans,
        'visitor',
        'Kunjungan per halaman per bulan',
        'Berlaku untuk tiap landing page. Setiap kali halaman dibuka dihitung satu kunjungan, dan hitungan diulang tiap tanggal 1.',
        (e) => fmt(e.maxVisitorMonth),
      ),
      rowOf(
        plans,
        'editor',
        'Editor visual dan mode HTML',
        'Ubah teks, gambar, dan tombol langsung di tampilan halaman, atau tempel kode HTML sendiri.',
        () => true,
      ),
      rowOf(
        plans,
        'publish',
        'Tayang di hulao.id/p/nama-halaman',
        'Atur judul dan deskripsi supaya rapi saat muncul di Google dan saat dibagikan.',
        () => true,
      ),
      rowOf(
        plans,
        'views',
        'Jumlah tayangan tiap halaman',
        undefined,
        () => true,
      ),
      rowOf(
        plans,
        'ai-generate',
        'Bikin landing page dengan AI',
        `Tulis deskripsi produk, AI menyusun halaman lengkap. Butuh saldo minimal ${fmt(LP_GENERATE_MIN_BALANCE)} token untuk memakainya.`,
        () => TOKEN_PER_USE,
      ),
    ],
  }
}

function lpLabSection(plans: PlanColumn[]): FeatureSection {
  return {
    key: 'lp-lab',
    title: 'LP Lab: analitik & optimasi',
    description:
      'Pahami perilaku pengunjung tiap halaman, lalu perbaiki dengan bantuan AI.',
    rows: [
      rowOf(
        plans,
        'lab-stats',
        'Statistik pengunjung lengkap',
        'Asal pengunjung (kampanye iklan dan situs perujuk), perangkat, corong konversi, dan tombol yang paling sering diklik.',
        (e) => e.lpLab,
      ),
      rowOf(
        plans,
        'lab-heatmap',
        'Peta klik (heatmap)',
        'Lihat bagian halaman yang paling sering diklik pengunjung.',
        (e) => e.lpLab,
      ),
      rowOf(
        plans,
        'lab-score',
        'Skor kualitas halaman',
        'Nilai 0-100 beserta grafik perkembangannya.',
        (e) => e.lpLab,
      ),
      rowOf(
        plans,
        'lab-signals',
        'Ringkasan keraguan pelanggan dari chat WhatsApp',
        'Keberatan yang paling sering muncul di chat, supaya bisa dijawab langsung di halaman.',
        (e) => e.lpLab,
      ),
      rowOf(
        plans,
        'lab-optimize',
        'Optimasi halaman dengan AI',
        'AI menyarankan perbaikan halaman. Setelah diterapkan, versi lama tetap bisa dikembalikan.',
        (e) => (e.lpLab ? TOKEN_PER_USE : false),
      ),
    ],
  }
}

function orderSystemSection(plans: PlanColumn[]): FeatureSection {
  const on = (e: PlanEntitlement) => e.orderSystem
  const ebookMB = Math.round(EBOOK_MAX_BYTES / (1024 * 1024))
  return {
    key: 'order-system',
    title: 'Sistem Order (jualan online)',
    description:
      'Terima pesanan langsung dari landing page atau link form order.',
    rows: [
      rowOf(
        plans,
        'products',
        'Katalog produk',
        `Hingga ${fmt(PRODUCT_LIMIT_PER_USER)} produk, masing-masing sampai ${PRODUCT_IMAGES_LIMIT} foto dan ${VARIANT_LIMIT_PER_PRODUCT} varian.`,
        on,
      ),
      rowOf(
        plans,
        'order-forms',
        'Form order (halaman checkout)',
        'Pembeli pilih produk, isi alamat, lalu otomatis dapat invoice online.',
        (e) => (e.orderSystem ? orderFormLabel(e.orderFormLimit) : false),
      ),
      rowOf(
        plans,
        'payment',
        'Pembayaran COD dan transfer bank',
        `Hingga ${BANK_ACCOUNT_LIMIT_PER_USER} rekening tujuan. Kamu dapat notifikasi WhatsApp tiap ada pesanan, pembeli bisa kirim bukti transfer lewat satu tombol.`,
        on,
      ),
      rowOf(
        plans,
        'shipping',
        'Hitung ongkir otomatis',
        `JNE, SiCepat, J&T, dan AnterAja. Bisa atur promo ongkir per wilayah (${SHIPPING_ZONE_LIMIT_PER_USER} zona) dan ${WAREHOUSE_LIMIT_PER_USER} gudang pengirim.`,
        on,
      ),
      rowOf(
        plans,
        'orders',
        'Kelola pesanan',
        'Saring per status, isi nomor resi, beri label, cetak daftar packing, dan unduh ke CSV.',
        on,
      ),
      rowOf(
        plans,
        'followup',
        'Follow-up otomatis lewat WhatsApp',
        'Pesan otomatis ke pembeli di tiap tahap: konfirmasi, pengingat bayar, pesanan dikirim, sampai minta ulasan.',
        on,
      ),
      rowOf(
        plans,
        'sales-boost',
        'Flash sale dan pendongkrak penjualan',
        'Harga promo terjadwal dengan hitung mundur, plus popup pembeli terbaru di form order.',
        on,
      ),
      rowOf(
        plans,
        'digital',
        'Jual e-book dan kelas online',
        `Hingga ${EBOOK_LIMIT_PER_USER} e-book (maks ${ebookMB} MB per file). Link akses terkirim otomatis ke WhatsApp pembeli setelah lunas.`,
        on,
      ),
      rowOf(
        plans,
        'pixel',
        'Pixel iklan',
        `Meta, TikTok, Google Ads, dan Google Analytics 4 (hingga ${PIXEL_INTEGRATION_LIMIT_PER_USER} pixel), aktif di landing page, form order, dan invoice.`,
        on,
      ),
      rowOf(
        plans,
        'reviews',
        'Kumpulkan testimoni pembeli',
        'Pembeli dapat link lewat WhatsApp untuk memberi bintang, ulasan, dan foto. Kamu pilih mana yang disetujui.',
        on,
      ),
      rowOf(
        plans,
        'cs-commerce',
        'AI CS paham produk dan ongkir',
        'AI di WhatsApp bisa menjawab harga, varian, promo, ongkir, dan nomor rekening dari data tokomu. Balasan AI bayar token.',
        on,
      ),
      rowOf(
        plans,
        'live-checkout',
        'Etalase produk di Live Room',
        'Penonton live bisa langsung pesan lewat form order tanpa keluar dari siaran.',
        on,
      ),
    ],
  }
}

function hostAiSection(plans: PlanColumn[]): FeatureSection {
  return {
    key: 'host-ai',
    title: 'Host AI (Live Shopping)',
    rows: [
      rowOf(
        plans,
        'host-create',
        'Bikin Host AI sendiri',
        'Pilih karakter host, AI membuatkan gambar, video gerak, dan klip jawaban bersuara untuk siaran live jualan.',
        (e) => (e.hostAi ? TOKEN_PER_USE : false),
      ),
    ],
  }
}

// Fitur WhatsApp tidak bergantung paket — ditampilkan supaya jelas tidak
// perlu upgrade untuk memakainya.
function whatsappSection(plans: PlanColumn[]): FeatureSection {
  return {
    key: 'whatsapp',
    title: 'WhatsApp & CRM',
    description: 'Tersedia di semua paket, termasuk Free.',
    rows: [
      rowOf(
        plans,
        'wa-ai-reply',
        'Balas chat WhatsApp otomatis dengan AI',
        'Atur kepribadian AI (Soul) dan pengetahuan bisnismu.',
        () => 'Bayar token per balasan',
      ),
      rowOf(
        plans,
        'inbox',
        'Inbox terpusat dan kontak pelanggan',
        undefined,
        () => true,
      ),
      rowOf(
        plans,
        'broadcast',
        'Broadcast pesan massal',
        'Kirim ke semua kontak atau per tag, bisa dijadwalkan. Lewat nomor resmi Meta, biaya pesan template ditagih Meta langsung.',
        () => true,
      ),
      rowOf(
        plans,
        'content-studio',
        'Content Studio AI',
        'Ide konten, naskah posting, dan teks iklan dari landing page kamu atau info produk yang kamu tulis.',
        () => TOKEN_PER_USE,
      ),
    ],
  }
}

export function buildFeatureSections(plans: PlanColumn[]): FeatureSection[] {
  return [
    landingPageSection(plans),
    lpLabSection(plans),
    orderSystemSection(plans),
    hostAiSection(plans),
    whatsappSection(plans),
  ]
}
