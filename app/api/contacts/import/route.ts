// POST /api/contacts/import — impor kontak dari CSV / tempel spreadsheet ke
// SATU nomor WA milik user.
//
// Body: { sessionId, tag?, text, dryRun? }
//   dryRun=true  → pratinjau: jumlah valid/tidak valid/duplikat/sudah ada,
//                  contoh alasan gagal, contoh nomor (disamarkan). Tidak menulis DB.
//   dryRun=false → tulis kontak (lihat lib/services/contacts/import-contacts.ts).
//
// Kontak hasil impor HANYA ditulis ke sesi yang dipilih (unique
// waSessionId+phoneNumber) — kontak di nomor WA lain tidak disentuh.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { consumeRateLimit } from '@/lib/rate-limit-memory'
import { importContactsForSession, previewSessionOverlap } from '@/lib/services/contacts/import-contacts'
import {
  buildImportPlan,
  DEFAULT_IMPORT_MAX_ROWS,
  maskImportPhone,
  normalizeImportTag,
  parseContactTable,
  ymdInJakarta,
} from '@/lib/services/contacts/import-parse'
import { contactImportSchema } from '@/lib/validations/contact-import'

export const dynamic = 'force-dynamic'

// Impor sungguhan menulis ribuan baris → ketat. Pratinjau hanya membaca →
// lebih longgar (user wajar memeriksa beberapa kali sambil merapikan data).
const RATE_WINDOW_MS = 10 * 60 * 1000
const IMPORT_LIMIT = 10
const DRY_RUN_LIMIT = 30
const INVALID_SAMPLE = 20
const VALID_SAMPLE = 5

const NO_VALID_MESSAGE =
  'Tidak ada nomor WhatsApp valid di data. Pastikan ada kolom nomor (mis. 0812… atau +62…).'

export async function POST(req: Request) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const userId = session.user.id

  try {
    const body = await req.json().catch(() => null)
    const parsed = contactImportSchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'Data tidak valid')
    }
    const { sessionId, dryRun } = parsed.data

    const rate = consumeRateLimit({
      key: `${dryRun ? 'contacts-import-check' : 'contacts-import'}:${userId}`,
      limit: dryRun ? DRY_RUN_LIMIT : IMPORT_LIMIT,
      windowMs: RATE_WINDOW_MS,
    })
    if (!rate.allowed) {
      const menit = Math.max(1, Math.ceil(rate.retryAfterMs / 60_000))
      return jsonError(`Terlalu banyak permintaan impor. Coba lagi dalam ${menit} menit.`, 429)
    }

    const wa = await prisma.whatsappSession.findFirst({
      where: { id: sessionId, userId, isActive: true },
      select: { id: true },
    })
    if (!wa) return jsonError('Nomor WhatsApp tidak ditemukan', 404)

    const table = parseContactTable(parsed.data.text)
    if (table.rows.length === 0) return jsonError('Data kontak kosong')

    const plan = buildImportPlan(table.rows, { maxRows: DEFAULT_IMPORT_MAX_ROWS })
    const tag = normalizeImportTag(parsed.data.tag, ymdInJakarta(new Date()))
    const summary = {
      totalRows: plan.totalRows,
      validCount: plan.valid.length,
      invalidCount: plan.invalid.length,
      duplicatesInFile: plan.duplicatesInFile,
      truncated: plan.truncated,
      maxRows: DEFAULT_IMPORT_MAX_ROWS,
      tag,
    }

    if (dryRun) {
      // validCount 0 tetap 200 di pratinjau supaya UI bisa menampilkan
      // alasan per baris; impor sungguhan menolaknya (400) di bawah.
      const overlap = await previewSessionOverlap({
        userId,
        sessionId,
        phones: plan.valid.map((c) => c.phone),
      })
      return jsonOk({
        ...summary,
        existingInSession: overlap.existingInSession,
        suppressedElsewhere: overlap.suppressedElsewhere,
        hasHeader: table.hasHeader,
        invalidSample: plan.invalid.slice(0, INVALID_SAMPLE),
        validSample: plan.valid
          .slice(0, VALID_SAMPLE)
          .map((c) => ({ phone: maskImportPhone(c.phone), name: c.name })),
      })
    }

    if (plan.valid.length === 0) return jsonError(NO_VALID_MESSAGE)

    const result = await importContactsForSession({
      userId,
      sessionId,
      contacts: plan.valid,
      tag,
    })
    return jsonOk({ ...result, invalidCount: plan.invalid.length, truncated: plan.truncated, tag })
  } catch (err) {
    console.error('[POST /api/contacts/import] gagal:', { userId, err })
    return jsonError('Gagal mengimpor kontak — coba lagi sebentar lagi', 500)
  }
}
