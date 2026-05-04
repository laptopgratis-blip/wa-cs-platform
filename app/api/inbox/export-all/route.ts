// GET /api/inbox/export-all
// Bundel SEMUA percakapan user (yang punya minimal 1 pesan) jadi satu file
// .zip — satu .md per kontak + _ringkasan.md di root zip.
//
// Rate limit: 1 request per 60 detik per user (in-memory, per process).
// In-memory map cukup untuk kebutuhan saat ini — kalau nanti di-deploy
// multi-instance, pindah ke Redis. Endpoint ini relatif berat (zip +
// banyak query) jadi memang perlu throttling.
import JSZip from 'jszip'
import { NextResponse } from 'next/server'

import { jsonError, requireSession } from '@/lib/api'
import { formatRelativeTime } from '@/lib/format-time'
import {
  buildExportFilename,
  formatExportDateKey,
  formatExportFullStamp,
  renderConversationMarkdown,
  type ExportContact,
} from '@/lib/inbox-export'
import { prisma } from '@/lib/prisma'

const COOLDOWN_MS = 60_000
const lastExportAt = new Map<string, number>()

function statusForSummary(c: { aiPaused: boolean; isResolved: boolean }): string {
  if (c.isResolved) return 'Selesai'
  if (c.aiPaused) return 'Manual'
  return 'AI Aktif'
}

// Escape pipe untuk cell tabel Markdown supaya tidak memecah kolom.
function escMd(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/\n/g, ' ')
}

export async function GET() {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const userId = session.user.id

  // Rate limit cek (cooldown 60 detik per user).
  const now = Date.now()
  const last = lastExportAt.get(userId)
  if (last && now - last < COOLDOWN_MS) {
    const retryAfter = Math.ceil((COOLDOWN_MS - (now - last)) / 1000)
    return NextResponse.json(
      {
        success: false,
        error: `Tunggu ${retryAfter} detik sebelum export semua percakapan lagi.`,
      },
      {
        status: 429,
        headers: { 'Retry-After': String(retryAfter) },
      },
    )
  }
  lastExportAt.set(userId, now)

  try {
    // Ambil semua kontak milik user yang punya minimal 1 pesan. Pakai
    // _count.messages > 0 di-filter di JS karena Prisma tidak support
    // _count di where untuk relation count.
    const contactsRaw = await prisma.contact.findMany({
      where: { userId },
      orderBy: { lastMessageAt: 'desc' },
      select: {
        id: true,
        name: true,
        phoneNumber: true,
        aiPaused: true,
        isResolved: true,
        lastMessageAt: true,
        waSession: {
          select: {
            displayName: true,
            soul: { select: { name: true } },
          },
        },
        _count: { select: { messages: true } },
      },
    })

    const contacts = contactsRaw.filter((c) => c._count.messages > 0)

    if (contacts.length === 0) {
      // Lepas slot rate limit kalau memang tidak ada apa-apa untuk diexport,
      // supaya user tidak terkunci 60 detik tanpa hasil.
      lastExportAt.delete(userId)
      return jsonError('Belum ada percakapan untuk diexport', 404)
    }

    const exportedAt = new Date()
    const zip = new JSZip()

    // Hindari nama file bentrok ketika dua kontak punya nama sama dengan
    // tanggal export sama — append index untuk duplikat.
    const usedNames = new Set<string>()
    function uniqueFilename(base: string): string {
      if (!usedNames.has(base)) {
        usedNames.add(base)
        return base
      }
      let i = 2
      const stem = base.replace(/\.md$/, '')
      let candidate = `${stem}-${i}.md`
      while (usedNames.has(candidate)) {
        i++
        candidate = `${stem}-${i}.md`
      }
      usedNames.add(candidate)
      return candidate
    }

    // Per kontak: query messages dan render. Sequential supaya tidak menghajar
    // koneksi DB (kalau ratusan kontak, parallel bisa over-saturate Supabase
    // pooler). Throughput cukup untuk skala saat ini.
    for (const c of contacts) {
      const messages = await prisma.message.findMany({
        where: { contactId: c.id },
        orderBy: { createdAt: 'asc' },
        select: { content: true, role: true, createdAt: true },
      })
      const exportContact: ExportContact = {
        name: c.name,
        phoneNumber: c.phoneNumber,
        aiPaused: c.aiPaused,
        isResolved: c.isResolved,
        waSession: c.waSession ? { displayName: c.waSession.displayName } : null,
        soulName: c.waSession?.soul?.name ?? null,
      }
      const md = renderConversationMarkdown(exportContact, messages, exportedAt)
      const filename = uniqueFilename(buildExportFilename(c, exportedAt))
      zip.file(filename, md)
    }

    // _ringkasan.md di root zip — leading underscore supaya selalu di atas
    // saat di-sort alphabetical di file explorer.
    const summaryLines: string[] = []
    summaryLines.push('# Ringkasan Semua Percakapan')
    summaryLines.push(`**Diekspor:** ${formatExportFullStamp(exportedAt)}`)
    summaryLines.push(`**Total Kontak:** ${contacts.length}`)
    summaryLines.push('')
    summaryLines.push('| Nama | Nomor | Total Pesan | Status | Terakhir Chat |')
    summaryLines.push('|------|-------|-------------|--------|---------------|')
    for (const c of contacts) {
      const nama = escMd(c.name || '—')
      const lastChat = c.lastMessageAt
        ? formatRelativeTime(c.lastMessageAt.toISOString())
        : '—'
      summaryLines.push(
        `| ${nama} | +${c.phoneNumber} | ${c._count.messages} | ${statusForSummary(c)} | ${lastChat} |`,
      )
    }
    summaryLines.push('')
    zip.file('_ringkasan.md', summaryLines.join('\n'))

    const buffer = await zip.generateAsync({ type: 'nodebuffer' })

    const zipName = `hulao-export-${formatExportDateKey(exportedAt)}.zip`
    // Buffer ⊂ Uint8Array sehingga BodyInit kompatibel di Next.js / Node.
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${zipName}"; filename*=UTF-8''${encodeURIComponent(zipName)}`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (err) {
    // Lepas slot rate limit kalau error — supaya user tidak terkunci karena
    // request gagal.
    lastExportAt.delete(userId)
    console.error(
      '[GET /api/inbox/export-all] gagal:',
      err instanceof Error ? `${err.name}: ${err.message}\n${err.stack}` : err,
    )
    return jsonError(
      err instanceof Error ? `Server error: ${err.message}` : 'Terjadi kesalahan server',
      500,
    )
  }
}
