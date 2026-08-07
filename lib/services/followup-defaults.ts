// Template default yang auto-create saat user enable Follow-Up Order System
// untuk pertama kali (DEFAULT_TEMPLATES order + LEAD_NURTURE_TEMPLATES +
// REVIEW_TEMPLATES). Semua POWER tier. Dipanggil dari
// POST /api/integrations/followup/enable.
//
// Variable available: {nama} {invoice} {total} {produk} {rekening} {wa_admin}
// {alamat} {etd} {kurir} {resi} {nama_toko} {invoice_url}

import { prisma } from '@/lib/prisma'

interface DefaultTemplate {
  name: string
  trigger: string
  paymentMethod: string | null
  // null = semua order; PHYSICAL = non-digital; DIGITAL = digital-only.
  orderType: string | null
  applyOnPaymentStatus: string | null
  applyOnDeliveryStatus: string | null
  delayDays: number
  order: number
  message: string
}

export const DEFAULT_TEMPLATES: DefaultTemplate[] = [
  {
    name: 'Konfirmasi COD - Order Masuk',
    trigger: 'ORDER_CREATED',
    paymentMethod: 'COD',
    orderType: null,
    applyOnPaymentStatus: null,
    applyOnDeliveryStatus: null,
    delayDays: 0,
    order: 1,
    message: `Halo kak {nama}! 🙏

Terima kasih sudah order di {nama_toko}.

Pesanan: {invoice}
{produk}
Total: {total}

Cara bayar: COD (Bayar di Tempat)
Estimasi sampai: {etd} hari kerja

Mohon konfirmasi apakah alamat di bawah sudah benar:
📍 {alamat}

Kalau ada perubahan atau pertanyaan, balas pesan ini ya.

Pesanan akan kami siapkan setelah konfirmasi. ✨`,
  },
  {
    name: 'Cara Bayar Transfer - Order Masuk',
    trigger: 'ORDER_CREATED',
    paymentMethod: 'TRANSFER',
    orderType: null,
    applyOnPaymentStatus: null,
    applyOnDeliveryStatus: null,
    delayDays: 0,
    order: 2,
    message: `Halo kak {nama}! 🙏

Terima kasih sudah order di {nama_toko}.

Pesanan: {invoice}
{produk}
Total Bayar: {total}

📌 Transfer ke salah satu rekening:
{rekening}

⚠️ Penting: Transfer dengan nominal PERSIS termasuk angka unik di belakang.

Setelah transfer, kirim bukti transfer ke nomor ini juga ya.

Lihat invoice lengkap: {invoice_url}`,
  },
  {
    name: 'Reminder Hari 1 - Belum Bayar',
    trigger: 'DAYS_AFTER_ORDER',
    paymentMethod: 'TRANSFER',
    orderType: null,
    applyOnPaymentStatus: 'PENDING',
    applyOnDeliveryStatus: null,
    delayDays: 1,
    order: 3,
    message: `Halo kak {nama} 🙏

Pesanan {invoice} sebesar {total} masih menunggu pembayaran nih.

Mau lanjut order? Transfer ke:
{rekening}

Pesanan akan otomatis dibatalkan kalau belum ada pembayaran dalam 24 jam.

Kalau ada kendala, langsung balas pesan ini.`,
  },
  {
    name: 'Pembayaran Diterima',
    trigger: 'PAYMENT_PAID',
    paymentMethod: null,
    // PHYSICAL: order digital-only pakai varian di bawah — pesan "kirim"
    // membingungkan untuk pembeli e-book.
    orderType: 'PHYSICAL',
    applyOnPaymentStatus: null,
    applyOnDeliveryStatus: null,
    delayDays: 0,
    order: 4,
    message: `✅ Pembayaran Diterima!

Halo {nama}, pembayaran untuk pesanan {invoice} sebesar {total} sudah kami terima.

Pesanan akan kami proses dan kirim secepatnya. Kami akan update saat sudah dikirim.

Terima kasih! 🙏`,
  },
  {
    name: 'Pembayaran Diterima (Produk Digital)',
    trigger: 'PAYMENT_PAID',
    paymentMethod: null,
    orderType: 'DIGITAL',
    applyOnPaymentStatus: null,
    applyOnDeliveryStatus: null,
    delayDays: 0,
    order: 4,
    message: `✅ Pembayaran Diterima!

Halo {nama}, pembayaran untuk pesanan {invoice} sebesar {total} sudah kami terima.

Akses produk digital kamu sudah AKTIF 🎉

Cek WhatsApp/email kamu — link akses & download sudah dikirim otomatis. Atau buka langsung Perpustakaan di:
{perpustakaan_url}
(login pakai nomor WA yang dipakai saat order)

Terima kasih! 🙏`,
  },
  {
    name: 'Pesanan Dikirim',
    trigger: 'SHIPPED',
    paymentMethod: null,
    orderType: null,
    applyOnPaymentStatus: null,
    applyOnDeliveryStatus: null,
    delayDays: 0,
    order: 5,
    message: `📦 Pesanan Dikirim!

Halo {nama}, pesanan {invoice} sudah dikirim via {kurir}.

No. Resi: {resi}
Estimasi sampai: {etd} hari kerja

Kalau sudah sampai, jangan lupa kabari ya 😊`,
  },
  {
    name: 'Konfirmasi Sampai - Hari 3',
    trigger: 'DAYS_AFTER_SHIPPED',
    paymentMethod: null,
    orderType: null,
    applyOnPaymentStatus: null,
    applyOnDeliveryStatus: null,
    delayDays: 3,
    order: 6,
    message: `Halo kak {nama} 🙏

Pesanan {invoice} sudah dikirim 3 hari lalu. Apakah barang sudah sampai dengan baik?

Kalau SUDAH sampai, klik link ini untuk konfirmasi (1 detik) ya:
{link_terima}

Kalau belum sampai / ada kendala, langsung balas pesan ini. Kami siap bantu 🙏`,
  },
  {
    name: 'Minta Review - Hari 5',
    trigger: 'DAYS_AFTER_SHIPPED',
    paymentMethod: null,
    orderType: null,
    applyOnPaymentStatus: null,
    applyOnDeliveryStatus: null,
    delayDays: 5,
    order: 7,
    message: `Halo kak {nama}!

Semoga barang dari pesanan {invoice} sudah sampai dan cocok ya 🙏

Boleh minta tolong kasih bintang + testimoni singkat? Cukup 1 klik, bisa sekalian upload foto:
{link_review}

Makasih banyak, sangat membantu kami ✨`,
  },
]

// Template panen testimoni "setelah diterima" (DAYS_AFTER_DELIVERED). Dipakai
// kalau order sudah ditandai DELIVERED (manual admin ATAU customer klik
// {link_terima}). Cadence: H+2 tanya "sudah dicoba?" + minta testimoni 1-klik.
export const REVIEW_TEMPLATES: DefaultTemplate[] = [
  {
    name: 'Testimoni - H+2 Setelah Diterima',
    trigger: 'DAYS_AFTER_DELIVERED',
    paymentMethod: null,
    orderType: null,
    applyOnPaymentStatus: null,
    applyOnDeliveryStatus: null,
    delayDays: 2,
    order: 8,
    message: `Halo kak {nama} 🙏

Pesanan {invoice} sudah diterima beberapa hari lalu. Sudah sempat dicoba/dipakai?

Kalau berkenan, bantu kasih bintang + testimoni singkat ya (1 klik, boleh sekalian foto):
{link_review}

Masukan kakak sangat berarti buat kami 🙏✨`,
  },
]

// Template nurture lead Live "belum order" (cadence 2 langkah: H+1 & H+3).
// trigger DAYS_AFTER_LIVE_LEAD — auto-berhenti begitu customer bikin order
// (cek di cron followup-send). Variable: {nama} {produk_minat} {nama_toko}
// {link_order}.
export const LEAD_NURTURE_TEMPLATES: DefaultTemplate[] = [
  {
    name: 'Live H+1 - Belum Order',
    trigger: 'DAYS_AFTER_LIVE_LEAD',
    paymentMethod: null,
    orderType: null,
    applyOnPaymentStatus: null,
    applyOnDeliveryStatus: null,
    delayDays: 1,
    order: 10,
    message: `Halo kak {nama} 🙏

Kemarin sempat lihat-lihat {produk_minat} di live {nama_toko} ya. Masih ada yang mau ditanyakan?

Kalau sudah mantap, langsung amankan stoknya di sini ya:
{link_order}

Balas pesan ini kalau ada yang mau dibantu 😊`,
  },
  {
    name: 'Live H+3 - Belum Order (Last Call)',
    trigger: 'DAYS_AFTER_LIVE_LEAD',
    paymentMethod: null,
    orderType: null,
    applyOnPaymentStatus: null,
    applyOnDeliveryStatus: null,
    delayDays: 3,
    order: 11,
    message: `Halo kak {nama}!

Stok {produk_minat} masih ada, tapi cepat habis kalau lagi rame. Biar nggak kehabisan, bisa langsung order di sini:
{link_order}

Ada kendala soal harga / pengiriman? Cerita aja ke saya, dibantu cari yang pas 🙏`,
  },
]

// Idempotent — kalau user sudah punya template (mungkin pernah enable lalu
// disable, lalu enable lagi), jangan create lagi. Caller bertanggung jawab cek
// existence sebelum panggil ini, tapi kita guard juga di sini.
export async function seedDefaultTemplates(userId: string): Promise<number> {
  const existing = await prisma.followUpTemplate.count({ where: { userId } })
  if (existing > 0) return 0

  const result = await prisma.followUpTemplate.createMany({
    data: [
      ...DEFAULT_TEMPLATES,
      ...LEAD_NURTURE_TEMPLATES,
      ...REVIEW_TEMPLATES,
    ].map((t) => ({
      ...t,
      userId,
      isDefault: true,
      isActive: true,
      scope: 'GLOBAL',
    })),
  })
  return result.count
}

// Top-up idempotent untuk user yang SUDAH enable follow-up sebelum fitur lead
// nurture ada. Dipanggil lazy dari generateQueueForLead — hanya menambah
// template DAYS_AFTER_LIVE_LEAD kalau user belum punya satupun.
export async function ensureLeadNurtureTemplates(
  userId: string,
): Promise<number> {
  const existing = await prisma.followUpTemplate.count({
    where: { userId, trigger: 'DAYS_AFTER_LIVE_LEAD' },
  })
  if (existing > 0) return 0

  const result = await prisma.followUpTemplate.createMany({
    data: LEAD_NURTURE_TEMPLATES.map((t) => ({
      ...t,
      userId,
      isDefault: true,
      isActive: true,
      scope: 'GLOBAL',
    })),
  })
  return result.count
}

// Top-up idempotent template PAYMENT_PAID varian DIGITAL untuk user lama yang
// enable follow-up sebelum fitur e-book ada. Dipanggil lazy dari
// generateQueueForOrder saat event PAYMENT_PAID pada order digital-only.
// Sekalian retarget template default "Pembayaran Diterima" lama (orderType
// null → PHYSICAL) supaya pembeli digital tidak dapat pesan "siap dikirim".
// Hanya template isDefault=true yang disentuh — template custom user aman.
export async function ensureDigitalPaidTemplates(
  userId: string,
): Promise<number> {
  const existing = await prisma.followUpTemplate.count({
    where: { userId, trigger: 'PAYMENT_PAID', orderType: 'DIGITAL' },
  })
  if (existing > 0) return 0

  const digitalTemplate = DEFAULT_TEMPLATES.find(
    (t) => t.trigger === 'PAYMENT_PAID' && t.orderType === 'DIGITAL',
  )
  if (!digitalTemplate) return 0

  await prisma.followUpTemplate.updateMany({
    where: {
      userId,
      trigger: 'PAYMENT_PAID',
      isDefault: true,
      orderType: null,
    },
    data: { orderType: 'PHYSICAL' },
  })

  const result = await prisma.followUpTemplate.createMany({
    data: [
      {
        ...digitalTemplate,
        userId,
        isDefault: true,
        isActive: true,
        scope: 'GLOBAL',
      },
    ],
  })
  return result.count
}

// Top-up idempotent template testimoni (DAYS_AFTER_DELIVERED) untuk user lama
// yang sudah enable follow-up sebelum fitur testimoni ada. Dipanggil lazy dari
// generateQueueForOrder saat event COMPLETED.
export async function ensureReviewTemplates(userId: string): Promise<number> {
  const existing = await prisma.followUpTemplate.count({
    where: { userId, trigger: 'DAYS_AFTER_DELIVERED' },
  })
  if (existing > 0) return 0

  const result = await prisma.followUpTemplate.createMany({
    data: REVIEW_TEMPLATES.map((t) => ({
      ...t,
      userId,
      isDefault: true,
      isActive: true,
      scope: 'GLOBAL',
    })),
  })
  return result.count
}
