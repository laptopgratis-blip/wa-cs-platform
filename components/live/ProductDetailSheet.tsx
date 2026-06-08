'use client'

// Detail bottom sheet untuk 1 produk — pattern TikTok/Shopee live shopping.
// Triggered dari klik FeaturedProductCard atau row di ProductBottomSheet.
// Inside: gallery swipe, deskripsi, variants chip, stok/flash quota indicator,
// social proof bar (viewers + sold), sticky bottom CTA Tanya host + Beli.

import { ArrowLeft, ChevronLeft, ChevronRight, Eye, Flame, ShoppingBag, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { FlashSaleCountdown } from './FlashSaleCountdown'

interface ProductVariant {
  id: string
  name: string
  sku: string | null
  price: number
  weightGrams: number
  stock: number | null
  imageUrl: string | null
}

interface ProductFull {
  id: string
  name: string
  description: string | null
  price: number
  imageUrl: string | null
  images: string[]
  stock: number | null
  weightGrams: number
  variants: ProductVariant[]
  flashSalePrice?: number | null
  flashSaleEndAt?: string | null
  flashSaleQuota?: number | null
  flashSaleSold?: number | null
}

interface SocialStats {
  viewersOpen: number
  soldThisRoom: number
  soldToday: number
}

const LOW_STOCK_THRESHOLD = 20

export function ProductDetailSheet({
  product,
  socialStats,
  totalProducts,
  onClose,
  onBuy,
  onSeeAll,
}: {
  product: ProductFull
  socialStats: SocialStats | null
  hostName: string
  totalProducts: number
  onClose: () => void
  onBuy: (product: ProductFull, variantId: string | null) => void
  onSeeAll: () => void
}) {
  const gallery = product.images.length > 0
    ? product.images
    : product.imageUrl
      ? [product.imageUrl]
      : []
  const [galleryIdx, setGalleryIdx] = useState(0)
  const [variantId, setVariantId] = useState<string | null>(
    product.variants[0]?.id ?? null,
  )
  const [descExpanded, setDescExpanded] = useState(false)

  // Reset state saat product berubah.
  useEffect(() => {
    setGalleryIdx(0)
    setVariantId(product.variants[0]?.id ?? null)
    setDescExpanded(false)
  }, [product.id, product.variants])

  const selectedVariant = useMemo(
    () => product.variants.find((v) => v.id === variantId) ?? null,
    [product.variants, variantId],
  )

  // Harga & stok efektif — pakai variant kalau ada, else product.
  const flashOn = product.flashSalePrice != null && product.flashSalePrice < product.price && !selectedVariant
  const basePrice = selectedVariant?.price ?? product.price
  const displayPrice = flashOn && product.flashSalePrice ? product.flashSalePrice : basePrice
  const originalPrice = flashOn ? product.price : null
  const discountPct = flashOn && product.flashSalePrice
    ? Math.round(((product.price - product.flashSalePrice) / product.price) * 100)
    : 0
  const effectiveStock = selectedVariant?.stock ?? product.stock
  const showLowStock = effectiveStock != null && effectiveStock > 0 && effectiveStock <= LOW_STOCK_THRESHOLD
  const outOfStock = effectiveStock != null && effectiveStock <= 0

  const flashQuotaRemaining =
    product.flashSaleQuota != null && product.flashSaleSold != null
      ? Math.max(0, product.flashSaleQuota - product.flashSaleSold)
      : null

  const desc = product.description ?? ''
  const longDesc = desc.length > 200
  const descPreview = longDesc && !descExpanded ? desc.slice(0, 200) + '…' : desc

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="product-detail-title"
    >
      <button
        type="button"
        aria-label="Tutup detail produk"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200"
      />
      <div
        className="relative z-10 flex w-full max-w-2xl flex-col rounded-t-3xl bg-white text-foreground shadow-2xl motion-safe:animate-in motion-safe:slide-in-from-bottom motion-safe:duration-300"
        style={{ maxHeight: '90dvh' }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-2.5" aria-hidden="true">
          <div className="h-1.5 w-12 rounded-full bg-warm-300" />
        </div>

        {/* Top bar */}
        <div className="flex items-center justify-between px-3 pb-2 pt-2">
          <button
            type="button"
            onClick={onSeeAll}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-warm-700 transition hover:bg-warm-100"
            aria-label={`Lihat semua ${totalProducts} produk`}
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Semua produk ({totalProducts})
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="flex h-9 w-9 items-center justify-center rounded-full text-warm-700 transition hover:bg-warm-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Body scroll */}
        <div className="overflow-y-auto pb-4">
          {/* ===== Gallery ===== */}
          {gallery.length > 0 ? (
            <div className="relative mx-3 overflow-hidden rounded-2xl bg-warm-100" style={{ aspectRatio: '1' }}>
              <img
                src={gallery[galleryIdx]}
                alt={product.name}
                className="h-full w-full object-cover"
              />
              {gallery.length > 1 ? (
                <>
                  <button
                    type="button"
                    onClick={() => setGalleryIdx((i) => (i - 1 + gallery.length) % gallery.length)}
                    aria-label="Foto sebelumnya"
                    className="absolute left-2 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur transition hover:bg-black/60"
                  >
                    <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setGalleryIdx((i) => (i + 1) % gallery.length)}
                    aria-label="Foto berikutnya"
                    className="absolute right-2 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur transition hover:bg-black/60"
                  >
                    <ChevronRight className="h-5 w-5" aria-hidden="true" />
                  </button>
                  <div
                    className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1 rounded-full bg-black/40 px-2 py-1 backdrop-blur"
                    role="tablist"
                    aria-label="Foto galeri"
                  >
                    {gallery.map((_, i) => (
                      <button
                        key={i}
                        type="button"
                        role="tab"
                        aria-selected={i === galleryIdx}
                        aria-label={`Foto ${i + 1} dari ${gallery.length}`}
                        onClick={() => setGalleryIdx(i)}
                        className={`h-1.5 rounded-full transition-all ${
                          i === galleryIdx ? 'w-4 bg-white' : 'w-1.5 bg-white/50'
                        }`}
                      />
                    ))}
                  </div>
                </>
              ) : null}
              {flashOn ? (
                <div className="absolute left-2 top-2 rounded-md bg-gradient-to-r from-red-600 to-orange-500 px-2 py-1 text-xs font-black uppercase tracking-wider text-white shadow-lg">
                  ⚡ -{discountPct}%
                </div>
              ) : null}
            </div>
          ) : null}

          {/* ===== Title + price ===== */}
          <div className="px-4 pt-4">
            <h2 id="product-detail-title" className="text-lg font-bold leading-snug text-foreground">
              {product.name}
            </h2>
            <div className="mt-2 flex items-baseline gap-2">
              <span className={`text-2xl font-black ${flashOn ? 'text-red-600' : 'text-orange-600'}`}>
                Rp {displayPrice.toLocaleString('id-ID')}
              </span>
              {originalPrice ? (
                <span className="text-sm text-warm-400 line-through">
                  Rp {originalPrice.toLocaleString('id-ID')}
                </span>
              ) : null}
            </div>
            {flashOn && product.flashSaleEndAt ? (
              <div className="mt-1.5 inline-flex items-center gap-2 rounded-md bg-red-50 px-2 py-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-red-700">
                  Flash sale berakhir
                </span>
                <FlashSaleCountdown endAt={product.flashSaleEndAt} />
              </div>
            ) : null}
            {flashQuotaRemaining != null && flashQuotaRemaining > 0 ? (
              <div className="mt-1.5 text-[11px] font-semibold text-red-700">
                🔥 Tinggal {flashQuotaRemaining} dari batch flash sale
              </div>
            ) : null}
          </div>

          {/* ===== Social proof bar ===== */}
          {socialStats ? (
            <div className="mx-4 mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-warm-50 px-3 py-2 text-xs">
              {socialStats.viewersOpen > 0 ? (
                <div className="flex items-center gap-1 text-warm-700">
                  <Eye className="h-3.5 w-3.5 text-orange-500" aria-hidden="true" />
                  <span>
                    <strong>{socialStats.viewersOpen}</strong> lagi nonton
                  </span>
                </div>
              ) : null}
              {socialStats.soldToday > 0 ? (
                <div className="flex items-center gap-1 text-warm-700">
                  <Flame className="h-3.5 w-3.5 text-red-500" aria-hidden="true" />
                  <span>
                    <strong>{socialStats.soldToday}</strong> beli hari ini
                  </span>
                </div>
              ) : null}
              {socialStats.soldThisRoom > 0 ? (
                <div className="flex items-center gap-1 text-warm-700">
                  <ShoppingBag className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                  <span>
                    <strong>{socialStats.soldThisRoom}</strong> total terjual
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* ===== Variants ===== */}
          {product.variants.length > 0 ? (
            <div className="px-4 pt-4">
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-warm-600">
                Pilih varian
              </div>
              <div className="flex flex-wrap gap-2">
                {product.variants.map((v) => {
                  const isSelected = v.id === variantId
                  const variantOut = v.stock != null && v.stock <= 0
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => !variantOut && setVariantId(v.id)}
                      disabled={variantOut}
                      aria-pressed={isSelected}
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                        isSelected
                          ? 'border-orange-500 bg-orange-50 text-orange-700 ring-1 ring-orange-300'
                          : variantOut
                            ? 'cursor-not-allowed border-warm-200 bg-warm-50 text-warm-400 line-through'
                            : 'border-warm-300 bg-white text-warm-700 hover:border-orange-300'
                      }`}
                    >
                      {v.name}
                      {v.price !== product.price ? (
                        <span className="ml-1 text-[10px] text-warm-500">
                          (Rp {v.price.toLocaleString('id-ID')})
                        </span>
                      ) : null}
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}

          {/* ===== Stock indicator ===== */}
          {outOfStock ? (
            <div className="mx-4 mt-3 rounded-lg bg-warm-100 px-3 py-2 text-xs font-medium text-warm-600">
              ⚪ Stok habis — coba varian lain atau tanya host kapan restock.
            </div>
          ) : showLowStock ? (
            <div className="mx-4 mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
              🔥 Tinggal {effectiveStock} stok!
            </div>
          ) : null}

          {/* ===== Description ===== */}
          {desc ? (
            <div className="px-4 pt-4">
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-warm-600">
                Deskripsi
              </div>
              <p className="whitespace-pre-line text-sm leading-relaxed text-warm-700">
                {descPreview}
              </p>
              {longDesc ? (
                <button
                  type="button"
                  onClick={() => setDescExpanded((v) => !v)}
                  className="mt-1 text-xs font-semibold text-orange-600 hover:underline"
                >
                  {descExpanded ? 'Lebih sedikit ↑' : 'Lebih lengkap ↓'}
                </button>
              ) : null}
            </div>
          ) : null}

          {/* ===== Shipping info (placeholder, static text — opt) ===== */}
          <div className="mx-4 mt-3 rounded-xl border border-warm-200 px-3 py-2 text-xs text-warm-700">
            <div className="font-semibold text-warm-800">📦 Pengiriman</div>
            <div className="mt-0.5">
              Berat {(selectedVariant?.weightGrams ?? product.weightGrams).toLocaleString('id-ID')}g •
              Estimasi 1-3 hari (JNE/J&T)
            </div>
          </div>

          {/* spacer untuk sticky bottom */}
          <div className="h-20" aria-hidden="true" />
        </div>

        {/* ===== Sticky bottom CTA ===== */}
        <div
          className="sticky bottom-0 z-10 flex items-center gap-2 border-t border-warm-200 bg-white/95 px-3 py-3 backdrop-blur"
          style={{
            paddingBottom: `max(env(safe-area-inset-bottom), 0.75rem)`,
          }}
        >
          <button
            type="button"
            onClick={() => onBuy(product, variantId)}
            disabled={outOfStock}
            aria-label={`Order ${product.name}${selectedVariant ? ` (${selectedVariant.name})` : ''}`}
            className={`flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl text-sm font-bold text-white shadow-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
              outOfStock
                ? 'cursor-not-allowed bg-warm-300'
                : flashOn
                  ? 'bg-gradient-to-r from-red-600 to-orange-500 hover:from-red-700 hover:to-orange-600 focus-visible:ring-red-400'
                  : 'bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 focus-visible:ring-orange-400'
            }`}
          >
            <ShoppingBag className="h-4 w-4" aria-hidden="true" />
            {outOfStock ? 'Stok habis' : 'Order sekarang'}
          </button>
        </div>
      </div>
    </div>
  )
}
