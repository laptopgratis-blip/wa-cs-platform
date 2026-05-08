// 7 template default yang auto-create saat user enable Follow-Up Order System
// untuk pertama kali. Semua POWER tier. Dipanggil dari
// POST /api/integrations/followup/enable.
//
// Variable available: {nama} {invoice} {total} {produk} {rekening} {wa_admin}
// {alamat} {etd} {kurir} {resi} {nama_toko} {invoice_url}

import { prisma } from '@/lib/prisma'

interface DefaultTemplate {
  name: string
  trigger: string
  paymentMethod: string | null
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
    name: 'Pesanan Dikirim',
    trigger: 'SHIPPED',
    paymentMethod: null,
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
    applyOnPaymentStatus: null,
    applyOnDeliveryStatus: null,
    delayDays: 3,
    order: 6,
    message: `Halo kak {nama} 🙏

Pesanan {invoice} sudah dikirim 3 hari lalu. Apakah barang sudah sampai dengan baik?

Kalau ada kendala atau barang belum sampai, langsung kabari ya. Kami siap bantu.`,
  },
  {
    name: 'Minta Review - Hari 5',
    trigger: 'DAYS_AFTER_SHIPPED',
    paymentMethod: null,
    applyOnPaymentStatus: null,
    applyOnDeliveryStatus: null,
    delayDays: 5,
    order: 7,
    message: `Halo kak {nama}!

Semoga barang dari pesanan {invoice} sudah sampai dan sesuai harapan ya 🙏

Boleh minta tolong kasih review/testimoni singkat? Kalau ada foto pakai produknya bisa banget juga, sangat bantu kami.

Terima kasih! ✨`,
  },
]

// Idempotent — kalau user sudah punya template (mungkin pernah enable lalu
// disable, lalu enable lagi), jangan create lagi. Caller bertanggung jawab cek
// existence sebelum panggil ini, tapi kita guard juga di sini.
export async function seedDefaultTemplates(userId: string): Promise<number> {
  const existing = await prisma.followUpTemplate.count({ where: { userId } })
  if (existing > 0) return 0

  const result = await prisma.followUpTemplate.createMany({
    data: DEFAULT_TEMPLATES.map((t) => ({
      ...t,
      userId,
      isDefault: true,
      isActive: true,
      scope: 'GLOBAL',
    })),
  })
  return result.count
}
