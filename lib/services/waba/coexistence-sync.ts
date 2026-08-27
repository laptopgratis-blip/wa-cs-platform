// Sinkronisasi coexistence: minta Meta mengirim kontak & riwayat chat dari
// WhatsApp Business App (HP) via webhook `smb_app_state_sync` / `history`.
// Aturan Meta: hanya SEKALI per sync_type per onboarding, dalam 24 JAM sejak
// onboarding. Karena itu: (1) trigger HANYA setelah subscribe webhook sukses
// (kalau tidak, data sync hilang selamanya), (2) urutan kontak → riwayat
// (nama kontak sudah ada saat thread masuk), (3) 2593107/2593108 dicatat
// rapi, tidak crash.

import { decrypt } from '@/lib/crypto'
import { prisma } from '@/lib/prisma'

import { graphRequest } from './graph'
import { coexSyncBlockedReason, inspectToken } from './token-info'

export type SmbSyncType = 'smb_app_state_sync' | 'history'

// Kode error Meta khusus sync coexistence.
const SYNC_ALREADY_REQUESTED = 2593107 // sekali per nomor per onboarding
const SYNC_OUTSIDE_WINDOW = 2593108 // > 24 jam sejak onboarding
// 135000 = "Generic user error": Meta menolak tanpa menyebut alasan. Pada
// endpoint smb_app_data penyebab paling sering adalah token yang dipakai BUKAN
// hasil Embedded Signup (mis. System User token yang ditempel manual) — sync
// coexistence butuh persetujuan pemilik WhatsApp Business App.
const SYNC_GENERIC_USER_ERROR = 135000

export type RequestSyncResult =
  | { ok: true; requestId?: string }
  | { ok: false; code?: number; message: string }

export async function requestSmbAppSync(
  phoneNumberId: string,
  userToken: string,
  syncType: SmbSyncType,
): Promise<RequestSyncResult> {
  const res = await graphRequest<{ request_id?: string; success?: boolean }>(
    `/${phoneNumberId}/smb_app_data`,
    {
      method: 'POST',
      token: userToken,
      body: { messaging_product: 'whatsapp', sync_type: syncType },
    },
  )
  if (!res.ok) {
    // Meta kadang menaruh kode spesifik di subcode.
    const code = res.error.subcode ?? res.error.code
    return { ok: false, code, message: res.error.message }
  }
  return { ok: true, requestId: res.data.request_id }
}

export function coexSyncErrorText(kind: 'kontak' | 'riwayat', code?: number, message?: string): string {
  if (code === SYNC_ALREADY_REQUESTED) {
    return `Sinkronisasi ${kind} sudah pernah diminta untuk onboarding ini (Meta 2593107) — hanya bisa sekali per koneksi.`
  }
  if (code === SYNC_OUTSIDE_WINDOW) {
    return (
      `Jendela 24 jam sinkronisasi ${kind} sudah lewat (Meta 2593108). ` +
      'Kalau ingin sinkron: putuskan koneksi di HP (WA Business App → Pengaturan → Akun → Platform Bisnis) lalu hubungkan ulang.'
    )
  }
  if (code === SYNC_GENERIC_USER_ERROR) {
    return (
      `Meta menolak sinkronisasi ${kind} tanpa menyebut alasan (135000). ` +
      'Penyebab paling sering: nomor ini dihubungkan memakai Token Manual ' +
      '(System User), padahal sinkronisasi dari HP hanya diizinkan untuk koneksi ' +
      'lewat Embedded Signup. Putuskan koneksi lalu hubungkan ulang lewat ' +
      'Embedded Signup kalau ingin menarik kontak & riwayat.'
    )
  }
  return `Sinkronisasi ${kind} gagal: ${message ?? 'error tidak diketahui'}${code ? ` (code ${code})` : ''}`
}

/**
 * Minta sync kontak lalu riwayat untuk sesi coexistence. NEVER throw.
 * Idempoten terhadap status: yang sudah REQUESTED/IN_PROGRESS/DONE/DECLINED
 * dilewati (jangan memicu 2593107 sia-sia).
 */
export async function startCoexistenceSync(sessionId: string): Promise<void> {
  try {
    const session = await prisma.whatsappSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        isCoexistence: true,
        phoneNumberId: true,
        wabaTokenEnc: true,
        coexContactSyncStatus: true,
        coexHistorySyncStatus: true,
      },
    })
    if (!session?.isCoexistence || !session.phoneNumberId || !session.wabaTokenEnc) return

    let token: string
    try {
      token = decrypt(session.wabaTokenEnc)
    } catch {
      await prisma.whatsappSession.update({
        where: { id: sessionId },
        data: { coexSyncError: 'Token tidak bisa didekripsi — sinkronisasi dilewati' },
      })
      return
    }

    // GERBANG SEBELUM MEMANGGIL META — urutannya penting.
    // Sync coexistence hanya boleh diminta SEKALI per sync_type per onboarding.
    // Kalau token-nya System User, Meta pasti menolak (135000) TAPI percobaan
    // itu tetap menghabiskan jatah tersebut. Jadi tipe token diperiksa lebih
    // dulu: kalau jelas tidak akan diterima, jangan panggil sama sekali —
    // simpan jatahnya untuk koneksi ulang lewat Embedded Signup nanti.
    const info = await inspectToken(token)
    const blocked = coexSyncBlockedReason(info?.type)
    if (blocked) {
      await prisma.whatsappSession.update({
        where: { id: sessionId },
        data: {
          coexSyncRequestedAt: new Date(),
          coexSyncError: blocked,
          // SKIPPED, bukan ERROR: tidak ada yang gagal — kita sengaja tidak
          // mencoba. Status ini juga tidak masuk daftar `skip` di bawah, jadi
          // sync tetap bisa jalan setelah user menghubungkan ulang via ES.
          coexContactSyncStatus: 'SKIPPED',
          coexHistorySyncStatus: 'SKIPPED',
        },
      })
      console.warn(`[waba/coex-sync] ${sessionId} dilewati — token ${info?.type ?? 'tidak diketahui'}`)
      return
    }

    await prisma.whatsappSession.update({
      where: { id: sessionId },
      data: { coexSyncRequestedAt: new Date(), coexSyncError: null },
    })

    const skip = new Set(['REQUESTED', 'IN_PROGRESS', 'DONE', 'DECLINED'])
    const errors: string[] = []

    // 1) Kontak
    if (!session.coexContactSyncStatus || !skip.has(session.coexContactSyncStatus)) {
      const r = await requestSmbAppSync(session.phoneNumberId, token, 'smb_app_state_sync')
      await prisma.whatsappSession.update({
        where: { id: sessionId },
        data: {
          coexContactSyncStatus: r.ok
            ? 'REQUESTED'
            : r.code === SYNC_OUTSIDE_WINDOW
              ? 'SKIPPED'
              : r.code === SYNC_ALREADY_REQUESTED && session.coexContactSyncStatus
                ? session.coexContactSyncStatus
                : 'ERROR',
        },
      })
      if (!r.ok) errors.push(coexSyncErrorText('kontak', r.code, r.message))
      console.log(`[waba/coex-sync] ${sessionId} kontak: ${r.ok ? `ok req=${r.requestId ?? '-'}` : `gagal ${r.code ?? ''} ${r.message}`}`)
    }

    // 2) Riwayat
    if (!session.coexHistorySyncStatus || !skip.has(session.coexHistorySyncStatus)) {
      const r = await requestSmbAppSync(session.phoneNumberId, token, 'history')
      await prisma.whatsappSession.update({
        where: { id: sessionId },
        data: {
          coexHistorySyncStatus: r.ok
            ? 'REQUESTED'
            : r.code === SYNC_OUTSIDE_WINDOW
              ? 'SKIPPED'
              : r.code === SYNC_ALREADY_REQUESTED && session.coexHistorySyncStatus
                ? session.coexHistorySyncStatus
                : 'ERROR',
        },
      })
      if (!r.ok) errors.push(coexSyncErrorText('riwayat', r.code, r.message))
      console.log(`[waba/coex-sync] ${sessionId} riwayat: ${r.ok ? `ok req=${r.requestId ?? '-'}` : `gagal ${r.code ?? ''} ${r.message}`}`)
    }

    if (errors.length > 0) {
      await prisma.whatsappSession.update({
        where: { id: sessionId },
        data: { coexSyncError: errors.join(' | ') },
      })
    }
  } catch (err) {
    console.error('[waba/coex-sync] gagal:', err)
    await prisma.whatsappSession
      .update({
        where: { id: sessionId },
        data: { coexSyncError: `Sinkronisasi gagal: ${(err as Error).message}` },
      })
      .catch(() => undefined)
  }
}
