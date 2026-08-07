// Notifikasi akses e-book pasca-PAID — kirim magic link /belajar via WA
// (primer) dengan email fallback.
//
// BEDA dari notif LMS (fire-and-forget): pakai pola KLAIM+SWEEP ala
// notifyNewOrder (lib/services/order-notif.ts) — EbookEntitlement.
// accessNotifiedAt jadi klaim atomik anti dobel-kirim; kalau dua kanal
// gagal, klaim dilepas (NULL) dan cron followup-send menyapu ulang s.d.
// 24 jam. Link e-book berbayar tidak boleh hilang cuma karena WA putus.
import { sendEbookAccessEmail } from '@/lib/email'
import { prisma } from '@/lib/prisma'
import { issueMagicLink } from '@/lib/services/lms/student-magic'
import { sendEbookAccessViaWa } from '@/lib/services/lms/wa-magic-sender'

export async function notifyEbookAccess(entitlementId: string): Promise<void> {
  const ent = await prisma.ebookEntitlement.findUnique({
    where: { id: entitlementId },
    select: {
      id: true,
      status: true,
      accessNotifiedAt: true,
      buyerPhone: true,
      buyerName: true,
      buyerEmail: true,
      maxDownloads: true,
      expiresAt: true,
      // userId penjual — sesi WA-nya jadi pengirim cadangan kalau admin down.
      ebook: { select: { title: true, userId: true } },
    },
  })
  if (!ent || !ent.ebook) return
  if (ent.status !== 'ACTIVE') return
  if (ent.accessNotifiedAt) return // sudah terkirim

  // Prasyarat SEBELUM klaim: magic link harus ter-issue. Gagal issue →
  // return tanpa klaim supaya disweep ulang nanti.
  let magicUrl: string
  try {
    const link = await issueMagicLink({
      phoneRaw: ent.buyerPhone,
      channel: 'WA',
      trigger: 'ENROLLMENT',
      skipThrottle: true,
    })
    magicUrl = link.url
  } catch (err) {
    console.error(`[ebook-notif] gagal issue magic link:`, err)
    return
  }

  // Klaim atomik — count 0 berarti run lain sudah mengklaim (race sweep vs
  // hook); mundur diam-diam.
  const claimed = await prisma.ebookEntitlement.updateMany({
    where: { id: ent.id, accessNotifiedAt: null },
    data: { accessNotifiedAt: new Date() },
  })
  if (claimed.count === 0) return

  const sendWa = await sendEbookAccessViaWa({
    buyerPhone: ent.buyerPhone,
    buyerName: ent.buyerName,
    magicUrl,
    ebookTitle: ent.ebook.title,
    maxDownloads: ent.maxDownloads,
    expiresAt: ent.expiresAt,
    sellerUserId: ent.ebook.userId,
  })

  let delivered = sendWa.delivered

  // Email hanya recovery channel — kirim kalau WA gagal & email tersedia.
  if (!delivered && ent.buyerEmail) {
    try {
      await sendEbookAccessEmail({
        email: ent.buyerEmail,
        buyerName: ent.buyerName,
        magicUrl,
        ebookTitle: ent.ebook.title,
      })
      delivered = true
      console.warn(
        `[ebook-notif] WA gagal — link akses dikirim via email ke ${ent.buyerEmail} (${ent.buyerPhone})`,
      )
    } catch (err) {
      console.error(`[ebook-notif] email fallback gagal:`, err)
    }
  }

  // Dua kanal gagal → lepas klaim supaya cron followup-send menyapu ulang.
  if (!delivered) {
    await prisma.ebookEntitlement
      .updateMany({
        where: { id: ent.id },
        data: { accessNotifiedAt: null },
      })
      .catch(() => {})
    console.warn(
      `[ebook-notif] WA & email gagal untuk ${ent.buyerPhone} — klaim dilepas, akan disweep cron`,
    )
  }
}
