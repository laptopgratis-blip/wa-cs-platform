// GET /api/v1/contacts?stage=&tag=&search=&limit=&cursor=
// Daftar kontak milik pemilik kunci API.
//
// Pagination CURSOR (bukan offset seperti /api/contacts internal): data kontak
// bergerak terus karena lastMessageAt berubah tiap ada pesan masuk, dan offset
// membuat baris terlewat/terduplikasi saat klien sedang menarik halaman.
import { apiV1Error, apiV1Ok, parsePagination, requirePublicApiAuth } from '@/lib/public-api-auth'
import { prisma } from '@/lib/prisma'
import { pipelineEnum } from '@/lib/validations/contact'

export const dynamic = 'force-dynamic'

// Kolom yang BOLEH keluar. Jangan pernah spread objek Prisma — `notes`,
// `customFields`, dan `aiPaused` sengaja tidak diekspos.
const PUBLIC_CONTACT_SELECT = {
  id: true,
  phoneNumber: true,
  name: true,
  tags: true,
  pipelineStage: true,
  isBlacklisted: true,
  isResolved: true,
  lastMessageAt: true,
  createdAt: true,
} as const

export async function GET(req: Request) {
  const gate = await requirePublicApiAuth(req)
  if (!gate.ok) return gate.response

  const url = new URL(req.url)
  const page = parsePagination(url)
  if (!page.ok) return apiV1Error('invalid_query', page.error, 400, gate.auth.rateLimitHeaders)

  const where: Record<string, unknown> = { userId: gate.auth.userId }

  const stage = url.searchParams.get('stage')
  if (stage) {
    const parsed = pipelineEnum.safeParse(stage)
    if (!parsed.success) {
      return apiV1Error(
        'invalid_query',
        `Parameter stage tidak dikenal. Pilihan: ${pipelineEnum.options.join(', ')}.`,
        400,
        gate.auth.rateLimitHeaders,
      )
    }
    where.pipelineStage = parsed.data
  }

  const tag = url.searchParams.get('tag')?.trim()
  if (tag) where.tags = { has: tag }

  const search = (url.searchParams.get('search') ?? '').trim()
  if (search) {
    if (search.length > 60) {
      return apiV1Error('invalid_query', 'Parameter search maksimal 60 karakter.', 400, gate.auth.rateLimitHeaders)
    }
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { phoneNumber: { contains: search } },
    ]
  }

  try {
    const rows = await prisma.contact.findMany({
      where: where as never,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: page.limit + 1,
      ...(page.cursor ? { cursor: { id: page.cursor }, skip: 1 } : {}),
      select: PUBLIC_CONTACT_SELECT,
    })

    const hasMore = rows.length > page.limit
    const items = hasMore ? rows.slice(0, page.limit) : rows

    return apiV1Ok(
      {
        items: items.map((c) => ({
          ...c,
          lastMessageAt: c.lastMessageAt?.toISOString() ?? null,
          createdAt: c.createdAt.toISOString(),
        })),
        nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
      },
      gate.auth,
    )
  } catch (err) {
    console.error('[api/v1/contacts] gagal:', err)
    return apiV1Error('server_error', 'Gagal memuat kontak.', 500, gate.auth.rateLimitHeaders)
  }
}
