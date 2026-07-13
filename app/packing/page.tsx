// Halaman Packing List — cetak daftar paket siap kemas per gudang (Fase 2
// multi-gudang). Route top-level /packing (tanpa sidebar dashboard). Dibuka via
// tombol "Cetak Packing List" di /pesanan, membawa filter gudang aktif.
//
// Scope = readyToPackWhere: belum dikirim & (COD atau lunas) & tak dibatalkan.
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'

import { PrintButton } from '@/components/orders/PrintButton'
import { authOptions } from '@/lib/auth'
import { readyToPackWhere } from '@/lib/order-fulfillment'
import { checkOrderSystemAccess } from '@/lib/order-system-gate'
import { prisma } from '@/lib/prisma'

export const metadata = { title: 'Packing List · Hulao' }

interface PackItem {
  name?: string
  qty?: number
  weight?: number
  variantName?: string | null
}

function parseItems(raw: unknown): PackItem[] {
  return Array.isArray(raw) ? (raw as PackItem[]) : []
}

function fmtRp(n: number | null | undefined): string {
  return `Rp ${(n ?? 0).toLocaleString('id-ID')}`
}

export default async function PackingPage({
  searchParams,
}: {
  searchParams: Promise<{ warehouseId?: string }>
}) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  const access = await checkOrderSystemAccess(session.user.id)
  if (!access.hasAccess) redirect('/pesanan')

  const sp = await searchParams
  const warehouseId =
    typeof sp.warehouseId === 'string' && sp.warehouseId ? sp.warehouseId : null

  const where = readyToPackWhere(session.user.id)
  if (warehouseId) {
    where.warehouseId = warehouseId === '__none__' ? null : warehouseId
  }

  const orders = await prisma.userOrder.findMany({
    where,
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      invoiceNumber: true,
      createdAt: true,
      customerName: true,
      customerPhone: true,
      shippingAddress: true,
      customerAddress: true,
      shippingCityName: true,
      shippingProvinceName: true,
      shippingPostalCode: true,
      shippingCourier: true,
      shippingService: true,
      paymentMethod: true,
      totalRp: true,
      uniqueCode: true,
      items: true,
      originSnapshot: true,
      notes: true,
    },
  })

  // Kelompokkan per gudang (nama dari originSnapshot). Urutan: gudang muncul
  // sesuai order pertama yang ditemukan.
  const groups = new Map<string, typeof orders>()
  for (const o of orders) {
    const snap = o.originSnapshot as { name?: string } | null
    const key = snap?.name ?? 'Tanpa gudang'
    const arr = groups.get(key) ?? []
    arr.push(o)
    groups.set(key, arr)
  }

  const printedAt = new Date().toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  return (
    <div className="min-h-dvh bg-neutral-100 text-neutral-900">
      <style
        dangerouslySetInnerHTML={{
          __html: `@page{size:A4;margin:12mm}
@media print{html,body{background:#fff!important}}`,
        }}
      />

      {/* Toolbar — layar saja */}
      <header className="no-print sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b bg-white px-4 py-3 shadow-sm print:hidden">
        <div>
          <h1 className="text-lg font-bold">Packing List</h1>
          <p className="text-sm text-neutral-500">
            {orders.length} paket siap kemas · dicetak {printedAt} WIB
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/pesanan"
            className="rounded-md border px-3 py-2 text-sm hover:bg-neutral-50"
          >
            Kembali
          </a>
          <PrintButton />
        </div>
      </header>

      <main className="mx-auto max-w-3xl p-4 print:max-w-none print:p-0">
        {orders.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-white p-12 text-center text-neutral-500">
            Tidak ada paket yang siap dikemas.
            <br />
            <span className="text-sm">
              (Order yang belum lunas / sudah dikirim tidak muncul di sini.)
            </span>
          </div>
        ) : (
          Array.from(groups.entries()).map(([whName, list]) => (
            <section key={whName} className="mb-6">
              <h2 className="mb-2 border-b-2 border-neutral-800 pb-1 text-base font-bold">
                Gudang: {whName}{' '}
                <span className="font-normal text-neutral-500">
                  — {list.length} paket
                </span>
              </h2>
              <div className="space-y-3">
                {list.map((o, i) => (
                  <PackingSlip key={o.id} order={o} index={i + 1} />
                ))}
              </div>
            </section>
          ))
        )}
      </main>
    </div>
  )
}

function PackingSlip({
  order,
  index,
}: {
  order: {
    invoiceNumber: string | null
    createdAt: Date
    customerName: string
    customerPhone: string | null
    shippingAddress: string | null
    customerAddress: string | null
    shippingCityName: string | null
    shippingProvinceName: string | null
    shippingPostalCode: string | null
    shippingCourier: string | null
    shippingService: string | null
    paymentMethod: string
    totalRp: number | null
    uniqueCode: number | null
    items: unknown
    notes: string | null
  }
  index: number
}) {
  const items = parseItems(order.items)
  const addr = order.shippingAddress ?? order.customerAddress ?? '—'
  const region = [order.shippingCityName, order.shippingProvinceName, order.shippingPostalCode]
    .filter(Boolean)
    .join(', ')
  const isCod = order.paymentMethod === 'COD'

  return (
    <article className="break-inside-avoid rounded-lg border border-neutral-300 bg-white p-3 text-sm print:rounded-none print:border-neutral-800">
      {/* Header baris */}
      <div className="flex items-start justify-between gap-2 border-b border-dashed border-neutral-300 pb-2">
        <div>
          <span className="mr-1 inline-flex size-5 items-center justify-center rounded-full bg-neutral-800 text-xs font-bold text-white print:bg-neutral-800">
            {index}
          </span>
          <span className="font-mono font-semibold">
            {order.invoiceNumber ?? '—'}
          </span>
        </div>
        <div className="text-right">
          {isCod ? (
            <span className="rounded border border-amber-600 px-1.5 py-0.5 text-xs font-bold text-amber-700">
              COD — TAGIH {fmtRp(order.totalRp)}
            </span>
          ) : (
            <span className="rounded border border-emerald-600 px-1.5 py-0.5 text-xs font-bold text-emerald-700">
              LUNAS · {fmtRp(order.totalRp)}
            </span>
          )}
        </div>
      </div>

      {/* Penerima + alamat + kurir */}
      <div className="grid grid-cols-1 gap-x-4 gap-y-1 py-2 sm:grid-cols-2">
        <div>
          <p className="text-xs text-neutral-500">Penerima</p>
          <p className="font-semibold">{order.customerName}</p>
          <p className="font-mono text-xs">{order.customerPhone ?? '—'}</p>
        </div>
        <div>
          <p className="text-xs text-neutral-500">Kurir</p>
          <p className="font-semibold uppercase">
            {order.shippingCourier ?? '—'}{' '}
            {order.shippingService ? `· ${order.shippingService}` : ''}
          </p>
        </div>
        <div className="sm:col-span-2">
          <p className="text-xs text-neutral-500">Alamat</p>
          <p>{addr}</p>
          {region && <p className="text-neutral-600">{region}</p>}
        </div>
      </div>

      {/* Item */}
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-y border-neutral-300 text-left text-xs text-neutral-500">
            <th className="w-6 py-1 pr-2 font-medium" aria-label="Sudah dikemas" />
            <th className="py-1 pr-2 font-medium">Qty</th>
            <th className="py-1 pr-2 font-medium">Produk</th>
            <th className="py-1 text-right font-medium">Berat</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i} className="border-b border-neutral-100 align-top">
              <td className="py-1 pr-2">
                <span className="inline-block size-3.5 rounded-sm border border-neutral-500" />
              </td>
              <td className="py-1 pr-2 font-semibold tabular-nums">{it.qty ?? 1}×</td>
              <td className="py-1 pr-2">{it.name ?? 'Produk'}</td>
              <td className="py-1 text-right tabular-nums text-neutral-600">
                {it.weight ? `${it.weight} g` : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Resi ditulis manual setelah pack */}
      <div className="mt-2 flex items-center gap-2 border-t border-dashed border-neutral-300 pt-2 text-xs">
        <span className="text-neutral-500">No. Resi:</span>
        <span className="flex-1 border-b border-neutral-400">&nbsp;</span>
      </div>
      {order.notes && (
        <p className="mt-1 text-xs text-neutral-500">Catatan: {order.notes}</p>
      )}
    </article>
  )
}
