// GET  /api/lp/images — list semua gambar milik user yang login.
// POST /api/lp/images — upload gambar (multipart/form-data, field "file" + opsional "lpId").
//
// Upload pipeline (per 2026-05-07 LP optimization):
//   1. Validasi tipe MIME (JPG/PNG/WebP/GIF)
//   2. Validasi ukuran raw vs MAX_RAW_BYTES (10 MB) — limit "input" sebelum
//      kompres, supaya tidak buang resource decode untuk file gigantes.
//   3. Validasi ukuran raw vs UserQuota.maxImageSizeMB — per-plan check.
//   4. Validasi total storage user vs UserQuota.maxStorageMB.
//   5. Sharp: rotate (EXIF) → resize max 1920px → encode WebP q=80.
//      Output rata-rata ≤500 KB, jauh hemat disk vs raw JPEG/PNG.
//   6. Tulis .webp ke disk + record DB. Storage usage di-track berdasar
//      ukuran SETELAH compress (yang benar-benar di disk).
//
// GIF di-skip dari compression — sharp WebP tidak bagus untuk animation.
// Tipe lain dipaksa jadi .webp untuk konsistensi cache & smaller size.
import { randomBytes } from 'crypto'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'

import type { NextResponse } from 'next/server'
import sharp from 'sharp'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import {
  checkStorageQuota,
  getUserQuota,
  updateStorageUsed,
} from '@/lib/lp-quota'
import { prisma } from '@/lib/prisma'

// Maksimum ukuran RAW upload (sebelum kompres). Lebih besar dari plan-limit
// karena setelah kompres bisa turun drastis — user yg upload foto kamera HP
// 8 MB JPEG biasa hasilkan WebP <500 KB.
const MAX_RAW_BYTES = 10 * 1024 * 1024
const MAX_DIMENSION = 1920 // px, fit "inside" + no enlargement
const WEBP_QUALITY = 80
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

export async function GET() {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  try {
    const images = await prisma.lpImage.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        filename: true,
        originalName: true,
        url: true,
        size: true,
        mimeType: true,
        lpId: true,
        createdAt: true,
      },
    })
    return jsonOk(
      images.map((img) => ({
        ...img,
        createdAt: img.createdAt.toISOString(),
      })),
    )
  } catch (err) {
    console.error('[GET /api/lp/images] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}

export async function POST(req: Request) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return jsonError('Format upload tidak valid (butuh multipart/form-data)')
  }

  const file = form.get('file')
  const lpIdRaw = form.get('lpId')
  const lpId = typeof lpIdRaw === 'string' && lpIdRaw.trim() ? lpIdRaw.trim() : null

  if (!(file instanceof File)) {
    return jsonError('File gambar tidak ditemukan')
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return jsonError('Tipe file harus JPG, PNG, WebP, atau GIF')
  }
  if (file.size > MAX_RAW_BYTES) {
    return jsonError(
      `Ukuran file mentah maksimal ${MAX_RAW_BYTES / 1024 / 1024} MB. File akan otomatis dikompres setelah upload.`,
    )
  }

  try {
    // Kalau lpId dikirim, pastikan LP itu memang milik user.
    if (lpId) {
      const lp = await prisma.landingPage.findUnique({
        where: { id: lpId },
        select: { userId: true },
      })
      if (!lp || lp.userId !== session.user.id) {
        return jsonError('Landing page tidak ditemukan', 404)
      }
    }

    // Cek per-image cap dari plan user (UserQuota.maxImageSizeMB). Cek dilakukan
    // pada ukuran RAW — supaya user free tidak nyolong upload 9.9 MB lalu di-
    // kompres jadi 1 MB (bypass cap). Kalau plan free (1 MB), user harus
    // resize/compress sendiri di luar dulu.
    const rawSizeMB = file.size / (1024 * 1024)
    const quota = await getUserQuota(session.user.id)
    if (rawSizeMB > quota.maxImageSizeMB) {
      return jsonError(
        `Ukuran file melebihi batas plan ${quota.tier} (${quota.maxImageSizeMB} MB). Upgrade plan atau kompres gambarnya dulu.`,
        413,
      )
    }

    // Cek kuota storage total. Pakai estimate ringan: WebP biasanya ~30-50%
    // dari raw JPEG/PNG, tapi defensive pakai raw size dulu — kalau lolos di
    // raw, pasti lolos di WebP. Update storage usage real setelah file ditulis.
    const quotaCheck = await checkStorageQuota(session.user.id, rawSizeMB)
    if (!quotaCheck.ok) {
      return jsonError(quotaCheck.reason ?? 'Storage tidak cukup', 413)
    }

    const rawBuffer = Buffer.from(await file.arrayBuffer())

    // GIF: skip kompresi (animation tidak diawetkan oleh sharp WebP encoder
    // tanpa flag khusus). Simpan as-is dengan extension asli.
    let storedBuffer: Buffer
    let storedExt: string
    let storedMime: string
    if (file.type === 'image/gif') {
      storedBuffer = rawBuffer
      storedExt = 'gif'
      storedMime = 'image/gif'
    } else {
      // sharp pipeline: rotate (EXIF auto-orient) → resize fit:inside →
      // re-encode WebP. Effort 4 = balance speed vs ratio (default 4 cocok).
      try {
        storedBuffer = await sharp(rawBuffer)
          .rotate()
          .resize(MAX_DIMENSION, MAX_DIMENSION, {
            fit: 'inside',
            withoutEnlargement: true,
          })
          .webp({ quality: WEBP_QUALITY, effort: 4 })
          .toBuffer()
        storedExt = 'webp'
        storedMime = 'image/webp'
      } catch (err) {
        console.error('[POST /api/lp/images] sharp gagal:', err)
        return jsonError(
          'Gagal memproses gambar. Pastikan file tidak corrupt.',
          400,
        )
      }
    }

    const filename = `${randomBytes(10).toString('hex')}.${storedExt}`
    const dir = path.join(
      process.cwd(),
      'public',
      'uploads',
      'lp-images',
      session.user.id,
    )
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, filename), storedBuffer)

    const url = `/uploads/lp-images/${session.user.id}/${filename}`
    const storedSize = storedBuffer.byteLength
    const compressionRatio = file.size > 0 ? storedSize / file.size : 1

    const created = await prisma.lpImage.create({
      data: {
        userId: session.user.id,
        lpId,
        filename,
        originalName: file.name,
        url,
        size: storedSize,
        mimeType: storedMime,
      },
      select: {
        id: true,
        filename: true,
        originalName: true,
        url: true,
        size: true,
        mimeType: true,
        lpId: true,
        createdAt: true,
      },
    })

    await updateStorageUsed(session.user.id, storedSize / (1024 * 1024))

    return jsonOk(
      {
        ...created,
        createdAt: created.createdAt.toISOString(),
        // Info tambahan untuk UI: "Original 4.2 MB → Compressed 0.5 MB (88% saving)".
        originalSize: file.size,
        compressionRatio: Math.round(compressionRatio * 100) / 100,
      },
      201,
    )
  } catch (err) {
    console.error('[POST /api/lp/images] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
