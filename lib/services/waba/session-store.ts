// Penyimpanan sesi Cloud API di tabel WhatsappSession (provider CLOUD_API).
// Token selalu dienkripsi sebelum masuk DB; phoneNumberId unique sehingga
// onboard ulang nomor yang sama meng-update row lama (relasi kontak awet).

import { encrypt } from '@/lib/crypto'
import { prisma } from '@/lib/prisma'

export interface UpsertCloudSessionInput {
  userId: string
  wabaId: string
  phoneNumberId: string
  displayPhoneNumber: string | null
  verifiedName: string | null
  accessToken: string
  /** Detik sampai token kedaluwarsa (dari exchange); default 60 hari. */
  expiresInSeconds?: number
}

export async function upsertCloudSession(input: UpsertCloudSessionInput) {
  const tokenEnc = encrypt(input.accessToken)
  const expiresAt = new Date(Date.now() + (input.expiresInSeconds ?? 5_184_000) * 1000)
  // Digit murni — format kanonik phoneNumber di seluruh platform.
  const phoneNumber = input.displayPhoneNumber?.replace(/\D/g, '') || null

  const common = {
    userId: input.userId,
    wabaId: input.wabaId,
    wabaTokenEnc: tokenEnc,
    wabaTokenExpiresAt: expiresAt,
    phoneNumber,
    displayName: input.verifiedName,
    status: 'CONNECTED' as const,
    isActive: true,
    lastError: null,
  }

  const existing = await prisma.whatsappSession.findUnique({
    where: { phoneNumberId: input.phoneNumberId },
    select: { id: true, userId: true },
  })

  if (existing) {
    // Nomor pernah di-onboard: hormati kepemilikan — jangan pindahkan sesi
    // milik user lain (beda dari kirimchat yang menimpa diam-diam).
    if (existing.userId !== input.userId) {
      throw new Error('Nomor ini sudah terhubung ke akun lain di platform')
    }
    return prisma.whatsappSession.update({
      where: { id: existing.id },
      data: common,
      select: { id: true, phoneNumber: true, displayName: true, status: true },
    })
  }

  return prisma.whatsappSession.create({
    data: {
      ...common,
      provider: 'CLOUD_API',
      phoneNumberId: input.phoneNumberId,
    },
    select: { id: true, phoneNumber: true, displayName: true, status: true },
  })
}
