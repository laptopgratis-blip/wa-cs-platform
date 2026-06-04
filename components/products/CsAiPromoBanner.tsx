// Banner CTA — muncul di halaman /products kalau user punya produk aktif
// tapi belum mengaktifkan integrasi katalog di CS AI.
//
// Server component supaya tidak ada flash. Tidak ada dismiss state — kalau
// user enable integrasi, banner otomatis hilang next render.
import { ArrowRight, Sparkles } from 'lucide-react'
import Link from 'next/link'

import { prisma } from '@/lib/prisma'

export async function CsAiPromoBanner({ userId }: { userId: string }) {
  const [integration, activeCount] = await Promise.all([
    prisma.csAiIntegration.findUnique({
      where: { userId },
      select: { productCatalogEnabled: true },
    }),
    prisma.product.count({ where: { userId, isActive: true } }),
  ])

  // Jangan tampil kalau: belum ada produk aktif (banner ngga relevan) atau
  // sudah aktif (user sudah ngerti).
  if (activeCount === 0) return null
  if (integration?.productCatalogEnabled) return null

  return (
    <Link
      href="/knowledge"
      className="group flex items-start gap-3 rounded-xl border-2 border-primary-200 bg-gradient-to-br from-primary-50 to-orange-50 p-4 transition hover:border-primary-400 hover:shadow-md"
    >
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-500 text-white shadow-orange">
        <Sparkles className="size-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-display text-sm font-extrabold text-warm-900">
          Biar CS AI bisa jawab pertanyaan produk otomatis?
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-warm-600">
          Aktifkan{' '}
          <strong>Akses Katalog Produk</strong> di halaman Pengetahuan —
          sekali klik, CS AI langsung tahu harga, stok, dan varian semua
          produkmu. Customer tanya, AI jawab sendiri tanpa nunggu admin.
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1 self-center text-xs font-semibold text-primary-600 transition group-hover:translate-x-0.5">
        Aktifkan
        <ArrowRight className="size-3.5" />
      </div>
    </Link>
  )
}
