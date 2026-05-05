// POST /api/admin/api-keys/test-all — test semua provider sekaligus parallel.
// Hasil: array { provider, ok, httpStatus, error? }
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireAdmin } from '@/lib/api'
import { PROVIDERS, testApiKey, type Provider } from '@/lib/ai-key-tester'
import { decrypt } from '@/lib/crypto'
import { prisma } from '@/lib/prisma'

interface RowResult {
  provider: Provider
  ok: boolean
  httpStatus: number
  error?: string
}

async function testOne(provider: Provider): Promise<RowResult> {
  const row = await prisma.apiKey.findUnique({ where: { provider } })
  if (!row) {
    return { provider, ok: false, httpStatus: 0, error: 'Belum ada key' }
  }
  let plaintext: string
  try {
    plaintext = decrypt(row.apiKey)
  } catch {
    const errMsg = 'Decrypt gagal — ENCRYPTION_KEY berubah?'
    await prisma.apiKey.update({
      where: { provider },
      data: {
        lastTestedAt: new Date(),
        lastTestStatus: 'FAILED',
        lastTestError: errMsg,
      },
    })
    return { provider, ok: false, httpStatus: 0, error: errMsg }
  }
  const r = await testApiKey(provider, plaintext)
  await prisma.apiKey.update({
    where: { provider },
    data: {
      lastTestedAt: new Date(),
      lastTestStatus: r.ok ? 'SUCCESS' : 'FAILED',
      lastTestError: r.ok ? null : r.error ?? 'unknown',
    },
  })
  return {
    provider,
    ok: r.ok,
    httpStatus: r.httpStatus,
    error: r.error,
  }
}

export async function POST() {
  try {
    await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }
  try {
    const results = await Promise.all(PROVIDERS.map(testOne))
    return jsonOk(results)
  } catch (err) {
    console.error('[POST /api/admin/api-keys/test-all] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
