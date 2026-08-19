// Ambil & dekripsi kredensial Cloud API (token, wabaId, phoneNumberId) dari
// WhatsappSession. Satu tempat supaya pesan error dekripsi konsisten dan
// kolom rahasia (wabaTokenEnc) tidak tersebar di banyak select.

import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/crypto'

export interface WabaCredentials {
  sessionId: string
  userId: string
  token: string
  wabaId: string
  phoneNumberId: string
  status: string
}

export type WabaCredentialsResult =
  | { ok: true; creds: WabaCredentials }
  | { ok: false; error: string }

const CRED_SELECT = {
  id: true,
  userId: true,
  provider: true,
  status: true,
  wabaId: true,
  phoneNumberId: true,
  wabaTokenEnc: true,
} as const

type CredRow = {
  id: string
  userId: string
  provider: string
  status: string
  wabaId: string | null
  phoneNumberId: string | null
  wabaTokenEnc: string | null
}

function toCredentials(row: CredRow | null): WabaCredentialsResult {
  if (!row || row.provider !== 'CLOUD_API') {
    return { ok: false, error: 'Sesi Cloud API tidak ditemukan' }
  }
  if (!row.wabaId || !row.phoneNumberId || !row.wabaTokenEnc) {
    return { ok: false, error: 'Sesi Cloud API belum punya kredensial lengkap — hubungkan ulang nomor' }
  }
  if (row.status === 'DISCONNECTED') {
    return { ok: false, error: 'Sesi Cloud API sudah diputus — hubungkan ulang' }
  }
  let token: string
  try {
    token = decrypt(row.wabaTokenEnc)
  } catch {
    return {
      ok: false,
      error: 'Token WABA tidak bisa didekripsi (ENCRYPTION_KEY berubah?) — hubungkan ulang nomor',
    }
  }
  return {
    ok: true,
    creds: {
      sessionId: row.id,
      userId: row.userId,
      token,
      wabaId: row.wabaId,
      phoneNumberId: row.phoneNumberId,
      status: row.status,
    },
  }
}

/** Kredensial by sesi (umum: kirim pesan, upload media, kelola template). */
export async function getWabaCredentialsBySession(
  sessionId: string,
): Promise<WabaCredentialsResult> {
  const row = await prisma.whatsappSession.findUnique({
    where: { id: sessionId },
    select: CRED_SELECT,
  })
  return toCredentials(row)
}

/**
 * Kredensial by WABA + pemilik — dipakai webhook template (App-level, hanya
 * tahu WABA ID) dan sync. Pilih sesi yang paling "hidup" (CONNECTED dulu).
 */
export async function getWabaCredentialsByWaba(
  wabaId: string,
  userId?: string,
): Promise<WabaCredentialsResult> {
  const rows = await prisma.whatsappSession.findMany({
    where: {
      provider: 'CLOUD_API',
      wabaId,
      ...(userId ? { userId } : {}),
      wabaTokenEnc: { not: null },
      status: { not: 'DISCONNECTED' },
    },
    select: CRED_SELECT,
    orderBy: { updatedAt: 'desc' },
    take: 5,
  })
  const preferred = rows.find((r) => r.status === 'CONNECTED') ?? rows[0] ?? null
  return toCredentials(preferred)
}
