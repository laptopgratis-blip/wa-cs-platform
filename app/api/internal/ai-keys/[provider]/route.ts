// GET /api/internal/ai-keys/[provider] — wa-service ambil decrypted API key.
// Auth: x-service-secret header == WA_SERVICE_SECRET.
//
// Response:
//   { success: true, data: { apiKey: '<plaintext>' } }
//   { success: false, error: 'no_key' | 'decrypt_failed' | 'inactive' }
//
// wa-service cache hasil ini 60 detik (lihat wa-service/src/ai-keys.ts).
import { NextResponse } from 'next/server'

import { PROVIDERS, type Provider } from '@/lib/ai-key-tester'
import { decrypt } from '@/lib/crypto'
import { requireServiceSecret } from '@/lib/internal-auth'
import { prisma } from '@/lib/prisma'

interface Params {
  params: Promise<{ provider: string }>
}

function isProvider(p: string): p is Provider {
  return (PROVIDERS as readonly string[]).includes(p)
}

export async function GET(req: Request, { params }: Params) {
  const blocked = requireServiceSecret(req)
  if (blocked) return blocked

  const { provider } = await params
  if (!isProvider(provider)) {
    return NextResponse.json(
      { success: false, error: 'unknown_provider' },
      { status: 400 },
    )
  }

  const row = await prisma.apiKey.findUnique({ where: { provider } })
  if (!row) {
    return NextResponse.json(
      { success: false, error: 'no_key' },
      { status: 404 },
    )
  }
  if (!row.isActive) {
    return NextResponse.json(
      { success: false, error: 'inactive' },
      { status: 403 },
    )
  }

  try {
    const apiKey = decrypt(row.apiKey)
    return NextResponse.json({
      success: true,
      data: {
        apiKey,
        lastTestStatus: row.lastTestStatus,
      },
    })
  } catch (err) {
    console.error('[GET /api/internal/ai-keys/:provider] decrypt gagal:', err)
    return NextResponse.json(
      { success: false, error: 'decrypt_failed' },
      { status: 500 },
    )
  }
}
