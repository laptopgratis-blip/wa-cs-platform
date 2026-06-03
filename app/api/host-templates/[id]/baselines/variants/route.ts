// GET /api/host-templates/[id]/baselines/variants
// Returns list of 3 baseline variant definitions (key, name, motionScript,
// description) untuk preview UI sebelum admin konfirm generate. No cost.

import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { listBaselineVariants } from '@/lib/services/host-gen/queue'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { id } = await params
  const host = await prisma.hostTemplate.findUnique({
    where: { id },
    select: { userId: true },
  })
  if (!host) return jsonError('Host tidak ditemukan', 404)
  if (session.user.role !== 'ADMIN' && host.userId !== session.user.id) {
    return jsonError('Tidak punya akses', 403)
  }

  // Cek varian mana yg udah pernah dibuat (by name).
  const existing = await prisma.hostScene.findMany({
    where: { hostTemplateId: id, isEnabled: true, name: { contains: 'Baseline' } },
    select: { name: true, status: true },
  })
  const existingNames = new Set(existing.map((s) => s.name))

  const variants = listBaselineVariants().map((v) => ({
    ...v,
    alreadyExists: existingNames.has(v.name),
    durationSec: 10,
    estimatedCostUsd: 1.5, // Kling pro 10s ~ $1.5
  }))
  return jsonOk({ variants })
}
