#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
// Compress LP image lama yang ter-upload sebelum sharp dipasang.
// Loop semua row di LpImage yg mimeType !== 'image/webp' dan file fisik ada,
// re-encode WebP, replace file di disk + update record (filename, url, size,
// mimeType). Lalu update htmlContent di LandingPage yg pakai URL lama supaya
// path baru dipakai → LP yg sudah live tidak broken.
//
// Usage:
//   node scripts/compress-existing-lp-images.js          → eksekusi nyata
//   node scripts/compress-existing-lp-images.js --dry-run → preview saja
//
// Idempotent — file yang sudah .webp di-skip.

const fs = require('node:fs/promises')
const path = require('node:path')
const sharp = require('sharp')
const { PrismaClient } = require('@prisma/client')

const DRY_RUN = process.argv.includes('--dry-run')
const PUBLIC_DIR = process.env.PUBLIC_DIR || path.join(process.cwd(), 'public')
const MAX_DIMENSION = 1920
const WEBP_QUALITY = 80

const prisma = new PrismaClient()

const stats = {
  scanned: 0,
  skipped_already_webp: 0,
  skipped_missing_file: 0,
  skipped_gif: 0,
  compressed: 0,
  bytes_before: 0,
  bytes_after: 0,
  lp_html_updated: 0,
  errors: [],
}

async function compressOne(img) {
  stats.scanned++

  if (img.mimeType === 'image/webp' && img.filename.endsWith('.webp')) {
    stats.skipped_already_webp++
    return
  }
  if (img.mimeType === 'image/gif') {
    // GIF dibiarkan — animation tidak diawetkan oleh sharp WebP encoder.
    stats.skipped_gif++
    return
  }

  // Path file di disk: /app/public + url, atau pakai PUBLIC_DIR override.
  const filePath = path.join(PUBLIC_DIR, img.url)
  let raw
  try {
    raw = await fs.readFile(filePath)
  } catch (err) {
    if (err.code === 'ENOENT') {
      stats.skipped_missing_file++
      console.log(`  ⚠ missing file ${img.url} (id=${img.id}) — skip`)
      return
    }
    throw err
  }

  stats.bytes_before += raw.byteLength

  const newFilename = img.filename.replace(/\.[^.]+$/, '') + '.webp'
  const newUrl = img.url.replace(/\.[^.]+$/, '') + '.webp'
  const newPath = path.join(path.dirname(filePath), newFilename)

  if (DRY_RUN) {
    console.log(
      `  [dry-run] ${img.url} (${raw.byteLength} B) → ${newUrl}`,
    )
    return
  }

  let compressed
  try {
    compressed = await sharp(raw)
      .rotate()
      .resize(MAX_DIMENSION, MAX_DIMENSION, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: WEBP_QUALITY, effort: 4 })
      .toBuffer()
  } catch (err) {
    stats.errors.push(`compress ${img.id}: ${err.message}`)
    return
  }

  // Tulis file baru. Hapus file lama hanya kalau extension berbeda — kalau
  // sama (sudah .webp tapi mimeType salah catat), file lama = file baru.
  await fs.writeFile(newPath, compressed)
  if (newPath !== filePath) {
    await fs.unlink(filePath).catch((err) => {
      if (err.code !== 'ENOENT') {
        stats.errors.push(`unlink ${img.url}: ${err.message}`)
      }
    })
  }

  stats.bytes_after += compressed.byteLength

  // Update DB record.
  await prisma.lpImage.update({
    where: { id: img.id },
    data: {
      filename: newFilename,
      url: newUrl,
      size: compressed.byteLength,
      mimeType: 'image/webp',
    },
  })

  // Replace URL di htmlContent semua LP user (LP yg pakai gambar ini).
  // Pakai updateMany dengan WHERE htmlContent CONTAINS — cheaper than scan.
  const lps = await prisma.landingPage.findMany({
    where: {
      userId: img.userId,
      htmlContent: { contains: img.url },
    },
    select: { id: true, htmlContent: true },
  })
  for (const lp of lps) {
    const updated = lp.htmlContent.split(img.url).join(newUrl)
    if (updated !== lp.htmlContent) {
      await prisma.landingPage.update({
        where: { id: lp.id },
        data: { htmlContent: updated },
      })
      stats.lp_html_updated++
    }
  }

  // Decrement storage usage delta (sebelumnya = raw, sekarang = compressed).
  const deltaMB = (compressed.byteLength - raw.byteLength) / (1024 * 1024)
  if (deltaMB !== 0) {
    await prisma.userQuota
      .updateMany({
        where: { userId: img.userId },
        data: { storageUsedMB: { increment: deltaMB } },
      })
      .catch((err) => stats.errors.push(`storage ${img.userId}: ${err.message}`))
  }

  stats.compressed++
  console.log(
    `  ✓ ${img.url} (${raw.byteLength} B) → ${newUrl} (${compressed.byteLength} B, -${(((1 - compressed.byteLength / raw.byteLength) * 100) | 0)}%)`,
  )
}

async function main() {
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'EXECUTE'}`)
  console.log(`Public dir: ${PUBLIC_DIR}`)

  const candidates = await prisma.lpImage.findMany({
    where: {
      mimeType: { not: 'image/webp' },
    },
    select: {
      id: true,
      userId: true,
      url: true,
      filename: true,
      mimeType: true,
      size: true,
    },
  })
  console.log(`Found ${candidates.length} non-WebP images to process\n`)

  for (const img of candidates) {
    try {
      await compressOne(img)
    } catch (err) {
      stats.errors.push(`${img.id}: ${err.message}`)
    }
  }

  console.log('\n=== Summary ===')
  console.log(JSON.stringify(stats, null, 2))
  if (!DRY_RUN && stats.compressed > 0) {
    const savedMb =
      (stats.bytes_before - stats.bytes_after) / (1024 * 1024)
    console.log(`Total saved: ${savedMb.toFixed(2)} MB`)
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error('FATAL:', err)
    process.exitCode = 1
    return prisma.$disconnect()
  })
