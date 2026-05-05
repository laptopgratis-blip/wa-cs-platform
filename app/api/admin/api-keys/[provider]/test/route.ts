// POST /api/admin/api-keys/[provider]/test — test koneksi 1 provider.
// Decrypt key, kirim minimal payload (max_tokens=1), simpan hasil ke DB.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireAdmin } from '@/lib/api'
import { PROVIDERS, testApiKey, type Provider } from '@/lib/ai-key-tester'
import { decrypt } from '@/lib/crypto'
import { prisma } from '@/lib/prisma'

interface Params {
  params: Promise<{ provider: string }>
}

function isProvider(p: string): p is Provider {
  return (PROVIDERS as readonly string[]).includes(p)
}

export async function POST(_req: Request, { params }: Params) {
  try {
    await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }
  const { provider } = await params
  if (!isProvider(provider)) {
    return jsonError('Provider tidak dikenal', 400)
  }

  const row = await prisma.apiKey.findUnique({ where: { provider } })
  if (!row) {
    return jsonError('Belum ada key untuk provider ini', 404)
  }

  let plaintext: string
  try {
    plaintext = decrypt(row.apiKey)
  } catch {
    const errMsg = 'Decrypt gagal — ENCRYPTION_KEY berubah? Re-input key.'
    await prisma.apiKey.update({
      where: { provider },
      data: {
        lastTestedAt: new Date(),
        lastTestStatus: 'FAILED',
        lastTestError: errMsg,
      },
    })
    return jsonOk({
      provider,
      ok: false,
      httpStatus: 0,
      error: errMsg,
    })
  }

  const result = await testApiKey(provider, plaintext)
  await prisma.apiKey.update({
    where: { provider },
    data: {
      lastTestedAt: new Date(),
      lastTestStatus: result.ok ? 'SUCCESS' : 'FAILED',
      lastTestError: result.ok ? null : result.error ?? 'unknown',
    },
  })

  return jsonOk({
    provider,
    ok: result.ok,
    httpStatus: result.httpStatus,
    error: result.error,
  })
}
