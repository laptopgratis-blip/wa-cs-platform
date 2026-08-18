// POST /api/whatsapp/waba/exchange
// Callback Embedded Signup (dipanggil halaman /whatsapp/waba-callback):
// validasi state → tukar code jadi token → discovery WABA + nomor →
// simpan sesi CLOUD_API → subscribe app ke WABA (webhook).
import type { NextResponse } from 'next/server'

import { z } from 'zod'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { exchangeCodeForToken, validateSignupState } from '@/lib/services/waba/oauth'
import {
  discoverWaba,
  registerPhoneNumber,
  subscribeAppToWaba,
} from '@/lib/services/waba/resources'
import { upsertCloudSession } from '@/lib/services/waba/session-store'

const bodySchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
  // WABA ID dari session-info event SDK Embedded Signup (bila frontend
  // menangkapnya) — membuat pemilihan WABA deterministik saat token punya
  // akses lebih dari satu WABA.
  wabaId: z.string().optional(),
})

export async function POST(req: Request) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Body tidak valid')
  }

  try {
    // Anti-CSRF/token-planting: state harus dibuat oleh user yang sama
    // dengan yang sedang login sekarang.
    const state = validateSignupState(parsed.data.state)
    if (!state || state.userId !== session.user.id) {
      console.error('[waba/exchange] state invalid/kedaluwarsa untuk user', session.user.id)
      return jsonError('State tidak valid atau kedaluwarsa — ulangi proses hubungkan', 400)
    }

    const exchange = await exchangeCodeForToken(parsed.data.code)
    if (!exchange.ok || !exchange.accessToken) {
      console.error('[waba/exchange] exchange code gagal:', exchange.error)
      // Status 4xx disengaja — Cloudflare mengganti body 502/504 dari origin
      // dengan halaman HTML-nya sehingga pesan error tidak sampai ke user.
      return jsonError(`Gagal menukar kode Meta: ${exchange.error}`, 400)
    }

    // WABA yang sudah terhubung user ini — untuk dukungan WABA kedua.
    const existingWabaIds = (
      await prisma.whatsappSession.findMany({
        where: { userId: session.user.id, wabaId: { not: null } },
        select: { wabaId: true },
      })
    )
      .map((s) => s.wabaId)
      .filter((id): id is string => Boolean(id))

    const discovery = await discoverWaba({
      userToken: exchange.accessToken,
      providedWabaId: parsed.data.wabaId,
      excludeWabaIds: existingWabaIds,
    })
    if (!discovery.ok) {
      console.error('[waba/exchange] discovery gagal:', discovery.error)
      return jsonError(discovery.error, 400)
    }

    // Increment 1: ambil nomor pertama WABA. Multi-nomor per WABA menyusul.
    const phone = discovery.waba.phoneNumbers[0]
    const created = await upsertCloudSession({
      userId: session.user.id,
      wabaId: discovery.waba.wabaId,
      phoneNumberId: phone.id,
      displayPhoneNumber: phone.display_phone_number ?? null,
      verifiedName: phone.verified_name ?? null,
      accessToken: exchange.accessToken,
      expiresInSeconds: exchange.expiresIn,
    })

    // Register nomor ke Cloud API HANYA kalau belum aktif. Nomor hasil
    // coexistence (Hubungkan Aplikasi WhatsApp Business) atau yang sudah
    // dipakai platform lain di WABA yang sama sudah CONNECTED — register
    // ulang justru ditolak (2388001) padahal nomor sehat. Nomor PENDING
    // (jalur standar) wajib register, kalau tidak Meta membuang pesan masuk.
    if (phone.status !== 'CONNECTED') {
      const reg = await registerPhoneNumber(phone.id, exchange.accessToken)
      if (!reg.ok) {
        console.error('[waba/exchange] register nomor gagal:', reg.error)
        await prisma.whatsappSession.update({
          where: { id: created.id },
          data: { status: 'ERROR', lastError: reg.error ?? 'Register nomor gagal' },
        })
        return jsonOk({
          sessionId: created.id,
          phoneNumber: created.phoneNumber,
          displayName: created.displayName,
          warning: reg.error,
        })
      }
    }

    // Tanpa subscribe, Meta tidak mengirim webhook — tapi kegagalan di sini
    // bisa di-retry, jadi jangan gagalkan koneksi: tandai ERROR + lastError.
    const sub = await subscribeAppToWaba(discovery.waba.wabaId, exchange.accessToken)
    if (!sub.ok) {
      await prisma.whatsappSession.update({
        where: { id: created.id },
        data: {
          status: 'ERROR',
          lastError: `Webhook belum aktif — subscribe app gagal: ${sub.error}`,
        },
      })
      return jsonOk({
        sessionId: created.id,
        phoneNumber: created.phoneNumber,
        displayName: created.displayName,
        warning: `Nomor terhubung tapi subscribe webhook gagal: ${sub.error}`,
      })
    }

    return jsonOk({
      sessionId: created.id,
      phoneNumber: created.phoneNumber,
      displayName: created.displayName,
    })
  } catch (err) {
    console.error('[POST /api/whatsapp/waba/exchange] gagal:', err)
    const msg = (err as Error).message
    // Pesan kepemilikan nomor layak diteruskan ke user.
    if (msg.includes('terhubung ke akun lain')) return jsonError(msg, 409)
    return jsonError('Terjadi kesalahan server saat menghubungkan nomor', 500)
  }
}
