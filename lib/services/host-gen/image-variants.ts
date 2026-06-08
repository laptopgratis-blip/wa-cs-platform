// Helper murni untuk kelola galeri kandidat gambar host (HostTemplate.imageVariants).
// JSON array — sourceImageUrl tetap pointer aktif yg dipakai semua pipeline video.
// Modul ini SENGAJA cuma import prisma (no charge/no gemini) supaya queue.ts bisa
// import dari sini tanpa circular dependency.
import { randomBytes } from 'node:crypto'

import { Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'

export interface HostImageVariant {
  id: string
  url: string // path public-relative `/uploads/...`
  source: 'GENERATED' | 'UPLOADED'
  label?: string
  withProduct?: boolean
  createdAt: string // ISO
}

export function newVariantId(): string {
  return `iv_${randomBytes(8).toString('hex')}`
}

// Parse JSON field jadi array typed (defensif terhadap data lama / null).
export function parseVariants(raw: unknown): HostImageVariant[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (v): v is HostImageVariant =>
      !!v &&
      typeof v === 'object' &&
      typeof (v as HostImageVariant).id === 'string' &&
      typeof (v as HostImageVariant).url === 'string',
  )
}

// Append 1 variant ke depan array (read-modify-write).
export async function appendImageVariant(
  hostTemplateId: string,
  variant: HostImageVariant,
): Promise<HostImageVariant[]> {
  const host = await prisma.hostTemplate.findUnique({
    where: { id: hostTemplateId },
    select: { imageVariants: true },
  })
  const current = parseVariants(host?.imageVariants)
  const next = [variant, ...current]
  await prisma.hostTemplate.update({
    where: { id: hostTemplateId },
    data: { imageVariants: next as unknown as Prisma.InputJsonValue },
  })
  return next
}

export async function removeImageVariant(
  hostTemplateId: string,
  variantId: string,
): Promise<HostImageVariant[]> {
  const host = await prisma.hostTemplate.findUnique({
    where: { id: hostTemplateId },
    select: { imageVariants: true },
  })
  const next = parseVariants(host?.imageVariants).filter((v) => v.id !== variantId)
  await prisma.hostTemplate.update({
    where: { id: hostTemplateId },
    data: { imageVariants: next as unknown as Prisma.InputJsonValue },
  })
  return next
}

// Backfill: kalau sourceImageUrl ada tapi belum tercatat di imageVariants,
// sisipkan otomatis sebagai kandidat GENERATED pertama. Idempotent.
// Return array final (sudah ter-backfill) untuk dipakai response.
export async function ensureSourceInVariants(host: {
  id: string
  sourceImageUrl: string | null
  imageVariants: unknown
}): Promise<HostImageVariant[]> {
  const current = parseVariants(host.imageVariants)
  if (!host.sourceImageUrl) return current
  if (current.some((v) => v.url === host.sourceImageUrl)) return current
  const seeded: HostImageVariant = {
    id: newVariantId(),
    url: host.sourceImageUrl,
    source: 'GENERATED',
    label: 'Gambar awal',
    createdAt: new Date().toISOString(),
  }
  const next = [seeded, ...current]
  await prisma.hostTemplate.update({
    where: { id: host.id },
    data: { imageVariants: next as unknown as Prisma.InputJsonValue },
  })
  return next
}
