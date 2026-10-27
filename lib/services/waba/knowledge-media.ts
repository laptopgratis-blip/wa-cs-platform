// Siapkan lampiran knowledge (IMAGE/FILE) untuk dikirim via Cloud API.
//
// File knowledge tersimpan lokal di public/uploads/knowledge/<userId>/ (lihat
// app/api/knowledge/upload). Dikirim by-bytes: dibaca dari disk → di-upload ke
// media API Meta → pesan pakai media id. SENGAJA bukan `link`: Meta harus
// men-fetch hulao.id lewat Cloudflare dan pernah gagal 131053 untuk URL
// media (lihat header-media-resolver.ts).
//
// Batasan Meta: gambar hanya image/jpeg & image/png (≤5 MB; webp = stiker
// saja) → webp/gif dikonversi ke JPEG. Dokumen: pdf, office, text/plain.
//
// Pure + deps diinjeksi (disk & sharp) supaya bisa diuji tanpa I/O.

import { statSync } from 'node:fs'
import path from 'node:path'

export const CLOUD_IMAGE_MAX_BYTES = 5 * 1024 * 1024
export const CLOUD_DOCUMENT_MAX_BYTES = 100 * 1024 * 1024

export type CloudMediaKind = 'image' | 'document'

export interface KnowledgeMediaSource {
  fileUrl: string
  title: string
  contentType: string
}

export interface KnowledgeMediaPlan {
  kind: CloudMediaKind
  /** Relatif terhadap folder public/, mis. uploads/knowledge/<uid>/a.jpg */
  relPath: string
  /** MIME yang dikirim ke Meta (setelah konversi bila ada). */
  mime: string
  /** Nama file yang tampil di chat (dokumen) — dari judul knowledge. */
  filename: string
  convertToJpeg: boolean
}

interface MediaRule {
  mime: string
  convertToJpeg?: boolean
}

const IMAGE_RULES: Record<string, MediaRule> = {
  jpg: { mime: 'image/jpeg' },
  jpeg: { mime: 'image/jpeg' },
  png: { mime: 'image/png' },
  webp: { mime: 'image/jpeg', convertToJpeg: true },
  gif: { mime: 'image/jpeg', convertToJpeg: true },
}

const DOCUMENT_RULES: Record<string, MediaRule> = {
  pdf: { mime: 'application/pdf' },
  doc: { mime: 'application/msword' },
  docx: {
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  },
  xls: { mime: 'application/vnd.ms-excel' },
  xlsx: {
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  },
  ppt: { mime: 'application/vnd.ms-powerpoint' },
  pptx: {
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  },
  txt: { mime: 'text/plain' },
  // Meta tidak menerima text/csv sebagai dokumen — kirim sebagai teks biasa,
  // nama file tetap .csv supaya customer tahu isinya.
  csv: { mime: 'text/plain' },
}

// Persis format yang ditulis route upload: satu segmen userId + nama file
// hex.ext. Tanpa subfolder, tanpa %-encoding, tanpa '..' → aman dari traversal.
const KNOWLEDGE_FILE_URL =
  /^\/uploads\/knowledge\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)\.([A-Za-z0-9]{1,5})$/

const MAX_FILENAME_BASE = 60

function documentFilename(title: string, ext: string): string {
  const base = title
    .replace(/[\u0000-\u001f\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_FILENAME_BASE)
    .trim()
  return `${/[\p{L}\p{N}]/u.test(base) ? base : 'dokumen'}.${ext}`
}

/**
 * Rencana kirim satu lampiran, atau null bila tak bisa dikirim via Cloud
 * (bukan file knowledge milik pemilik sesi, atau tipe tidak didukung Meta).
 * Dipakai juga SEBELUM generate AI supaya prompt hanya menjanjikan lampiran
 * yang memang bisa dikirim.
 */
export function planKnowledgeMedia(
  source: KnowledgeMediaSource,
  ownerUserId: string,
): KnowledgeMediaPlan | null {
  const match = KNOWLEDGE_FILE_URL.exec(source.fileUrl ?? '')
  if (!match) return null
  const [, userId, name, rawExt] = match
  if (userId !== ownerUserId) return null

  const ext = rawExt.toLowerCase()
  const kind: CloudMediaKind | null =
    source.contentType === 'IMAGE'
      ? 'image'
      : source.contentType === 'FILE'
        ? 'document'
        : null
  if (!kind) return null
  const rule = (kind === 'image' ? IMAGE_RULES : DOCUMENT_RULES)[ext]
  if (!rule) return null

  return {
    kind,
    relPath: path.join('uploads', 'knowledge', userId, `${name}.${rawExt}`),
    mime: rule.mime,
    filename:
      kind === 'document'
        ? documentFilename(source.title, ext)
        : `${name}.${ext}`,
    convertToJpeg: rule.convertToJpeg === true,
  }
}

/**
 * Cek murah (tanpa baca isi) sebelum generate AI: file ada, tidak kosong,
 * dan — untuk gambar tanpa konversi — tidak melebihi batas Meta. Ukuran
 * webp/gif baru pasti setelah konversi, jadi dinilai saat load. `statSize`
 * mengembalikan ukuran byte atau null bila bukan file / tidak ada.
 */
export function isKnowledgeMediaAvailable(
  plan: KnowledgeMediaPlan,
  publicDir: string,
  statSize: (absPath: string) => number | null = defaultStatSize,
): boolean {
  const size = statSize(path.join(publicDir, plan.relPath))
  if (!size || size <= 0) return false
  if (plan.kind === 'image' && !plan.convertToJpeg)
    return size <= CLOUD_IMAGE_MAX_BYTES
  return plan.kind === 'image' || size <= CLOUD_DOCUMENT_MAX_BYTES
}

function defaultStatSize(absPath: string): number | null {
  try {
    const stat = statSync(absPath)
    return stat.isFile() ? stat.size : null
  } catch {
    return null
  }
}

export interface KnowledgeMediaDeps {
  readFile: (absPath: string) => Promise<Buffer>
  toJpeg: (buffer: Buffer) => Promise<Buffer>
}

export type LoadedKnowledgeMedia =
  | {
      ok: true
      kind: CloudMediaKind
      buffer: Buffer
      mime: string
      filename: string
    }
  | { ok: false; error: string }

/** Baca (dan konversi bila perlu) file lampiran. NEVER throw. */
export async function loadKnowledgeMedia(
  plan: KnowledgeMediaPlan,
  publicDir: string,
  deps: KnowledgeMediaDeps = defaultKnowledgeMediaDeps,
): Promise<LoadedKnowledgeMedia> {
  let buffer: Buffer
  try {
    buffer = await deps.readFile(path.join(publicDir, plan.relPath))
  } catch (err) {
    return {
      ok: false,
      error: `file tidak terbaca (${(err as NodeJS.ErrnoException).code ?? 'error'})`,
    }
  }
  if (buffer.length === 0) return { ok: false, error: 'file kosong' }

  if (plan.convertToJpeg) {
    try {
      buffer = await deps.toJpeg(buffer)
    } catch (err) {
      return {
        ok: false,
        error: `konversi ke JPEG gagal: ${(err as Error).message}`,
      }
    }
  }

  const max =
    plan.kind === 'image' ? CLOUD_IMAGE_MAX_BYTES : CLOUD_DOCUMENT_MAX_BYTES
  if (buffer.length > max) {
    return {
      ok: false,
      error: `ukuran ${buffer.length} byte melebihi batas Meta ${max}`,
    }
  }
  return {
    ok: true,
    kind: plan.kind,
    buffer,
    mime: plan.mime,
    filename: plan.filename,
  }
}

export const defaultKnowledgeMediaDeps: KnowledgeMediaDeps = {
  readFile: async (absPath) => {
    const { readFile } = await import('node:fs/promises')
    return readFile(absPath)
  },
  toJpeg: async (buffer) => {
    // Frame pertama saja (gif animasi) + latar putih untuk area transparan.
    const { default: sharp } = await import('sharp')
    return sharp(buffer, { animated: false })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 85 })
      .toBuffer()
  },
}
