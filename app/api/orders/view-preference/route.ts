// GET /api/orders/view-preference — load preference user. Auto-create record
// kosong saat pertama kali dipanggil supaya frontend dapat shape stabil.
// PUT /api/orders/view-preference — upsert preference. Frontend save debounced.
import type { NextResponse } from 'next/server'
import { z } from 'zod'

import { jsonError, jsonOk } from '@/lib/api'
import { ORDER_COLUMNS } from '@/lib/order-columns'
import { requireOrderSystemAccess } from '@/lib/order-system-gate'
import { prisma } from '@/lib/prisma'

const validKeys = new Set(ORDER_COLUMNS.map((c) => c.key))

const updateSchema = z
  .object({
    visibleColumns: z
      .array(z.string())
      .max(50)
      .refine(
        (arr) => arr.every((k) => validKeys.has(k)),
        'Ada column key yang tidak dikenal',
      )
      .optional(),
    columnOrder: z
      .array(z.string())
      .max(50)
      .refine(
        (arr) => arr.every((k) => validKeys.has(k)),
        'Ada column key yang tidak dikenal',
      )
      .optional(),
    filters: z.record(z.string(), z.unknown()).nullable().optional(),
    sortColumn: z.string().nullable().optional(),
    sortDirection: z.enum(['asc', 'desc']).nullable().optional(),
    pageSize: z.number().int().min(10).max(200).optional(),
  })
  .refine(
    (v) => Object.keys(v).length > 0,
    'Minimal 1 field harus diisi untuk update',
  )

export async function GET() {
  let session
  try {
    ;({ session } = await requireOrderSystemAccess())
  } catch (res) {
    return res as NextResponse
  }
  const pref = await prisma.userOrderViewPreference.findUnique({
    where: { userId: session.user.id },
  })
  return jsonOk({
    preference: pref
      ? {
          visibleColumns: pref.visibleColumns,
          columnOrder: pref.columnOrder,
          filters: pref.filters,
          sortColumn: pref.sortColumn,
          sortDirection: pref.sortDirection,
          pageSize: pref.pageSize,
          updatedAt: pref.updatedAt.toISOString(),
        }
      : null,
  })
}

export async function PUT(req: Request) {
  let session
  try {
    ;({ session } = await requireOrderSystemAccess())
  } catch (res) {
    return res as NextResponse
  }
  const json = await req.json().catch(() => null)
  const parsed = updateSchema.safeParse(json)
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Data tidak valid')
  }
  const data = parsed.data
  // Server enforce minimum 1 visible column kalau dikirim — frontend juga
  // validate, ini defense in depth.
  if (data.visibleColumns && data.visibleColumns.length === 0) {
    return jsonError('Minimal 1 kolom harus aktif', 400)
  }
  const updated = await prisma.userOrderViewPreference.upsert({
    where: { userId: session.user.id },
    create: {
      userId: session.user.id,
      visibleColumns: data.visibleColumns ?? [],
      columnOrder: data.columnOrder ?? [],
      filters: (data.filters ?? null) as never,
      sortColumn: data.sortColumn ?? null,
      sortDirection: data.sortDirection ?? null,
      pageSize: data.pageSize ?? 50,
    },
    update: {
      ...(data.visibleColumns !== undefined && {
        visibleColumns: data.visibleColumns,
      }),
      ...(data.columnOrder !== undefined && { columnOrder: data.columnOrder }),
      ...(data.filters !== undefined && {
        filters: (data.filters ?? null) as never,
      }),
      ...(data.sortColumn !== undefined && { sortColumn: data.sortColumn }),
      ...(data.sortDirection !== undefined && {
        sortDirection: data.sortDirection,
      }),
      ...(data.pageSize !== undefined && { pageSize: data.pageSize }),
    },
  })
  return jsonOk({
    visibleColumns: updated.visibleColumns,
    columnOrder: updated.columnOrder,
    filters: updated.filters,
    sortColumn: updated.sortColumn,
    sortDirection: updated.sortDirection,
    pageSize: updated.pageSize,
    updatedAt: updated.updatedAt.toISOString(),
  })
}
