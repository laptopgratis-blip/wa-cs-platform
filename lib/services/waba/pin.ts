// PIN two-step verification untuk register nomor ke Cloud API (jalur standar,
// BUKAN coexistence). Per-nomor: user boleh isi PIN lama (nomor bekas yang
// sudah punya 2FA), kalau kosong hulao generate 6 digit acak — disimpan
// terenkripsi di WhatsappSession dan ditampilkan SEKALI ke user.

import { randomInt } from 'node:crypto'

import { decrypt, encrypt } from '@/lib/crypto'
import { prisma } from '@/lib/prisma'

export function generateRegisterPin(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

/**
 * PIN yang pernah dipakai user ini untuk nomor yang sama (row sesi lama yang
 * di-wipe / nonaktif). Dipakai ulang supaya re-onboard tidak gagal 133005.
 */
export async function findPreviousPin(
  userId: string,
  phoneDigits: string,
): Promise<{ pin: string; generated: boolean } | null> {
  if (!phoneDigits) return null
  const rows = await prisma.whatsappSession.findMany({
    where: {
      userId,
      provider: 'CLOUD_API',
      phoneNumber: phoneDigits,
      wabaPinEnc: { not: null },
    },
    orderBy: { updatedAt: 'desc' },
    select: { wabaPinEnc: true, wabaPinGenerated: true },
    take: 3,
  })
  for (const row of rows) {
    try {
      return { pin: decrypt(row.wabaPinEnc as string), generated: row.wabaPinGenerated }
    } catch {
      // ENCRYPTION_KEY berubah — lewati, coba row berikutnya.
    }
  }
  return null
}

export async function storeSessionPin(
  sessionId: string,
  pin: string,
  generated: boolean,
): Promise<void> {
  await prisma.whatsappSession.update({
    where: { id: sessionId },
    data: { wabaPinEnc: encrypt(pin), wabaPinGenerated: generated },
  })
}
