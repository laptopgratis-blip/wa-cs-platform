// GET /api/v1/senders — nomor WhatsApp terhubung milik pemilik kunci.
//
// PERINGATAN: JANGAN PERNAH menambahkan `adminSessions: true` di sini.
// Opsi itu memasukkan sesi WA milik ADMIN (pool platform) ke daftar kandidat —
// dipakai jalur OTP internal, dan kalau bocor lewat API publik, seller bisa
// melihat nomor WA platform beserta id sesinya.
import { apiV1Error, apiV1Ok, requirePublicApiAuth } from '@/lib/public-api-auth'
import { listSenderCandidates } from '@/lib/wa-session'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const gate = await requirePublicApiAuth(req)
  if (!gate.ok) return gate.response

  try {
    const candidates = await listSenderCandidates({ userId: gate.auth.userId })
    return apiV1Ok(
      {
        // Urutan = prioritas pemakaian otomatis oleh platform (Baileys dulu,
        // lalu Cloud API). `wabaId` sengaja tidak diekspos.
        items: candidates.map((c) => ({
          sessionId: c.sessionId,
          provider: c.provider,
          phoneNumber: c.phoneNumber,
          label: c.label,
        })),
      },
      gate.auth,
    )
  } catch (err) {
    console.error('[api/v1/senders] gagal:', err)
    return apiV1Error('server_error', 'Gagal memuat daftar pengirim.', 500, gate.auth.rateLimitHeaders)
  }
}
