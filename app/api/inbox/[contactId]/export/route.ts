// GET /api/inbox/[contactId]/export
// Download percakapan satu kontak sebagai file .md untuk dianalisa AI eksternal.
// Hanya owner kontak yang boleh — dijaga via requireSession + filter userId.
import { NextResponse } from 'next/server'

import { jsonError, requireSession } from '@/lib/api'
import {
  buildExportFilename,
  renderConversationMarkdown,
  type ExportContact,
} from '@/lib/inbox-export'
import { prisma } from '@/lib/prisma'

interface Params {
  params: Promise<{ contactId: string }>
}

export async function GET(_req: Request, { params }: Params) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }

  const { contactId } = await params
  try {
    // Owner check di-bundle ke filter where supaya tidak ada kemungkinan akses
    // lintas user — lebih aman daripada cek manual setelah fetch.
    const contact = await prisma.contact.findFirst({
      where: { id: contactId, userId: session.user.id },
      select: {
        id: true,
        name: true,
        phoneNumber: true,
        aiPaused: true,
        isResolved: true,
        waSession: {
          select: {
            displayName: true,
            soul: { select: { name: true } },
          },
        },
      },
    })
    if (!contact) return jsonError('Kontak tidak ditemukan', 404)

    const messages = await prisma.message.findMany({
      where: { contactId },
      orderBy: { createdAt: 'asc' },
      select: { content: true, role: true, createdAt: true },
    })

    const exportedAt = new Date()
    const exportContact: ExportContact = {
      name: contact.name,
      phoneNumber: contact.phoneNumber,
      aiPaused: contact.aiPaused,
      isResolved: contact.isResolved,
      waSession: contact.waSession
        ? { displayName: contact.waSession.displayName }
        : null,
      soulName: contact.waSession?.soul?.name ?? null,
    }

    const md = renderConversationMarkdown(exportContact, messages, exportedAt)
    const filename = buildExportFilename(contact, exportedAt)

    // RFC 5987 filename* untuk dukungan karakter non-ASCII di nama kontak.
    return new NextResponse(md, {
      status: 200,
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (err) {
    console.error(
      '[GET /api/inbox/:id/export] gagal:',
      err instanceof Error ? `${err.name}: ${err.message}\n${err.stack}` : err,
    )
    return jsonError(
      err instanceof Error ? `Server error: ${err.message}` : 'Terjadi kesalahan server',
      500,
    )
  }
}
