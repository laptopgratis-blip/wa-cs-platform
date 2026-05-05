// GET  /api/admin/api-keys — list semua provider (apiKey di-mask, hanya 4
//                            char terakhir yang di-expose).
// POST /api/admin/api-keys — upsert key untuk satu provider (encrypt).
import type { NextResponse } from 'next/server'
import { z } from 'zod'

import { jsonError, jsonOk, requireAdmin } from '@/lib/api'
import { PROVIDERS, type Provider } from '@/lib/ai-key-tester'
import { decrypt, encrypt, maskKey } from '@/lib/crypto'
import { prisma } from '@/lib/prisma'

const upsertSchema = z.object({
  provider: z.enum(['ANTHROPIC', 'OPENAI', 'GOOGLE']),
  apiKey: z.string().trim().min(8).max(500),
})

export async function GET() {
  try {
    await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }
  try {
    const rows = await prisma.apiKey.findMany({
      orderBy: { provider: 'asc' },
    })
    // Ensure semua provider direturn meskipun belum ada row di DB → UI bisa
    // render 3 card konsisten.
    const byProvider = new Map(rows.map((r) => [r.provider, r]))
    const data = PROVIDERS.map((p): {
      provider: Provider
      maskedKey: string | null
      isActive: boolean
      lastTestedAt: string | null
      lastTestStatus: string | null
      lastTestError: string | null
    } => {
      const row = byProvider.get(p)
      if (!row) {
        return {
          provider: p,
          maskedKey: null,
          isActive: false,
          lastTestedAt: null,
          lastTestStatus: null,
          lastTestError: null,
        }
      }
      let masked: string | null = null
      try {
        masked = maskKey(decrypt(row.apiKey))
      } catch {
        // Encryption key changed / data rusak → treat as kosong tapi tetap
        // expose error info supaya admin tahu.
        masked = null
      }
      return {
        provider: p,
        maskedKey: masked,
        isActive: row.isActive,
        lastTestedAt: row.lastTestedAt?.toISOString() ?? null,
        lastTestStatus: row.lastTestStatus,
        lastTestError: row.lastTestError,
      }
    })
    return jsonOk(data)
  } catch (err) {
    console.error('[GET /api/admin/api-keys] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }
  const parsed = upsertSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Body tidak valid')
  }
  const { provider, apiKey } = parsed.data

  let encrypted: string
  try {
    encrypted = encrypt(apiKey)
  } catch (err) {
    console.error('[POST /api/admin/api-keys] encrypt gagal:', err)
    return jsonError(
      'ENCRYPTION_KEY belum di-set di server. Hubungi admin.',
      500,
    )
  }

  try {
    const saved = await prisma.apiKey.upsert({
      where: { provider },
      create: {
        provider,
        apiKey: encrypted,
        isActive: true,
      },
      update: {
        apiKey: encrypted,
        // Reset status test setelah ganti key — admin perlu test ulang.
        lastTestedAt: null,
        lastTestStatus: null,
        lastTestError: null,
      },
      select: { provider: true },
    })
    return jsonOk({ provider: saved.provider, maskedKey: maskKey(apiKey) })
  } catch (err) {
    console.error('[POST /api/admin/api-keys] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
