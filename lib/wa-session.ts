// Pemilihan session WA yang BENAR-BENAR terhubung untuk mengirim pesan.
//
// Kontak di-pin ke `waSessionId` saat dibuat (unique [waSessionId, phoneNumber]).
// Setiap kali user scan QR / re-pair / WA ke-kick lalu connect lagi, baris
// WhatsappSession baru dibuat dengan id baru dan session lama jadi DISCONNECTED.
// Akibatnya MAYORITAS kontak lama nge-pin ke session yang sudah mati. Inbox
// `/send` dulu mengirim lewat `contact.waSessionId` mentah → wa-service balas
// "session belum siap" → balasan GAGAL terkirim padahal chat tetap tampil di
// inbox. Inilah bug "tidak bisa membalas ke nomor penerima tapi muncul di inbox".
//
// Aturan: pakai session kontak kalau memang masih CONNECTED (jaga konsistensi
// kalau user punya >1 nomor aktif); kalau tidak, fallback ke session CONNECTED
// milik user yang paling baru. null = user tidak punya session terhubung sama
// sekali (caller WAJIB gagalkan kirim dengan pesan jelas, bukan diam-diam).
import { prisma } from '@/lib/prisma'

export async function resolveConnectedSessionId(
  userId: string,
  preferredSessionId: string | null | undefined,
): Promise<string | null> {
  if (preferredSessionId) {
    const pref = await prisma.whatsappSession.findFirst({
      where: { id: preferredSessionId, userId, status: 'CONNECTED' },
      select: { id: true },
    })
    if (pref) return pref.id
  }
  const live = await prisma.whatsappSession.findFirst({
    where: { userId, status: 'CONNECTED', isActive: true },
    orderBy: { updatedAt: 'desc' },
    select: { id: true },
  })
  return live?.id ?? null
}
