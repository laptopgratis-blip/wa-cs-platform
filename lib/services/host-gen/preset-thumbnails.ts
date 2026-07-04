// Generator thumbnail untuk preset Klip Live (VisualHookPreset + BackgroundPreset).
//
// Seed (prisma/seeds/backgrounds-and-hooks.ts) men-set thumbnailUrl placeholder
// `/uploads/presets/<slug>.png` tapi file gambarnya tidak pernah dibuat, sehingga
// picker wizard tampil text-only. Service ini backfill: generate gambar via
// Gemini (pipeline host-gen yang sama), kompres via sharp → webp kecil, simpan ke
// `public/uploads/presets/<slug>.webp` (volume uploads, di-serve nginx), lalu
// update thumbnailUrl.
//
// Tidak ada charge token — ini asset platform, dipicu admin dari
// /admin/host-templates (bukan aksi user berbayar).
import { access, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import sharp from 'sharp'

import { prisma } from '@/lib/prisma'

import { generateGeminiImageBuffer } from './gemini-image'

const PRESETS_DIR = path.join(process.cwd(), 'public', 'uploads', 'presets')

export type PresetKind = 'hook' | 'background'

export interface MissingPreset {
  kind: PresetKind
  id: string
  slug: string
  nameId: string
}

export interface PresetThumbnailStatus {
  total: number
  done: number
  missing: MissingPreset[]
}

// Cek file thumbnail benar-benar ada di disk. thumbnailUrl bisa berisi
// placeholder seed yang menunjuk file yang tidak pernah dibuat.
async function thumbnailFileExists(thumbnailUrl: string | null): Promise<boolean> {
  if (!thumbnailUrl || !thumbnailUrl.startsWith('/uploads/')) return false
  const abs = path.join(process.cwd(), 'public', thumbnailUrl.slice(1))
  try {
    await access(abs)
    return true
  } catch {
    return false
  }
}

export async function getPresetThumbnailStatus(): Promise<PresetThumbnailStatus> {
  const [hooks, backgrounds] = await Promise.all([
    prisma.visualHookPreset.findMany({
      where: { isActive: true },
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }],
      select: { id: true, slug: true, nameId: true, thumbnailUrl: true },
    }),
    prisma.backgroundPreset.findMany({
      where: { isActive: true },
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }],
      select: { id: true, slug: true, nameId: true, thumbnailUrl: true },
    }),
  ])

  const missing: MissingPreset[] = []
  for (const h of hooks) {
    if (!(await thumbnailFileExists(h.thumbnailUrl))) {
      missing.push({ kind: 'hook', id: h.id, slug: h.slug, nameId: h.nameId })
    }
  }
  for (const b of backgrounds) {
    if (!(await thumbnailFileExists(b.thumbnailUrl))) {
      missing.push({ kind: 'background', id: b.id, slug: b.slug, nameId: b.nameId })
    }
  }

  const total = hooks.length + backgrounds.length
  return { total, done: total - missing.length, missing }
}

// Prompt hook: tampilkan host Indonesia mengenakan/memegang hook-nya —
// promptFragment seed berbentuk "wearing ... / holding ...".
function hookPrompt(promptFragment: string, description: string): string {
  return [
    'Square studio thumbnail photo of ONE Indonesian live-shopping host',
    '(upper body, facing camera, friendly confident expression),',
    `${promptFragment}.`,
    `Context: ${description}.`,
    'Plain soft neutral studio background with subtle gradient,',
    'professional soft lighting, vivid colors, sharp focus.',
    'No text, no watermark, no logo.',
  ].join(' ')
}

// Prompt background: scene-nya saja tanpa host. promptFragment seed sering
// diawali "Behind the host:" — dibuang supaya tidak memicu render orang.
function backgroundPrompt(promptFragment: string): string {
  const cleaned = promptFragment.replace(/^behind the host:?\s*/i, '')
  return [
    `Wide 4:3 scene thumbnail photo: ${cleaned}`,
    'Scene only — NO main host person posing in the foreground.',
    'Photorealistic, vivid, professional lighting, sharp focus.',
    'No text overlay, no watermark, no logo.',
  ].join(' ')
}

export interface GeneratedThumbnail {
  kind: PresetKind
  slug: string
  thumbnailUrl: string
}

// Generate 1 thumbnail preset → simpan webp → update DB. Throw kalau gagal
// (caller kumpulkan error per-slug).
export async function generatePresetThumbnail(
  kind: PresetKind,
  id: string,
): Promise<GeneratedThumbnail> {
  const preset =
    kind === 'hook'
      ? await prisma.visualHookPreset.findUnique({
          where: { id },
          select: { id: true, slug: true, description: true, promptFragment: true },
        })
      : await prisma.backgroundPreset.findUnique({
          where: { id },
          select: { id: true, slug: true, description: true, promptFragment: true },
        })
  if (!preset) throw new Error(`Preset ${kind}:${id} tidak ditemukan`)

  const prompt =
    kind === 'hook'
      ? hookPrompt(preset.promptFragment, preset.description)
      : backgroundPrompt(preset.promptFragment)

  const raw = await generateGeminiImageBuffer({ prompt })

  // Kompres: grid picker render semua preset sekaligus (75 kartu) — wajib kecil.
  // Hook kartu square, background 4:3.
  const resized =
    kind === 'hook'
      ? sharp(raw.buffer).resize(512, 512, { fit: 'cover' })
      : sharp(raw.buffer).resize(640, 480, { fit: 'cover' })
  const webp = await resized.webp({ quality: 80 }).toBuffer()

  await mkdir(PRESETS_DIR, { recursive: true })
  await writeFile(path.join(PRESETS_DIR, `${preset.slug}.webp`), webp)

  const thumbnailUrl = `/uploads/presets/${preset.slug}.webp`
  if (kind === 'hook') {
    await prisma.visualHookPreset.update({
      where: { id: preset.id },
      data: { thumbnailUrl },
    })
  } else {
    await prisma.backgroundPreset.update({
      where: { id: preset.id },
      data: { thumbnailUrl },
    })
  }

  return { kind, slug: preset.slug, thumbnailUrl }
}
