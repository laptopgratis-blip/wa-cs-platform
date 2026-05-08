'use client'

// Form Order publik — customer-facing, mobile-first. Live pricing yang
// dihitung sisi server (POST /api/shipping/cost untuk ongkir RajaOngkir).
import {
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Loader2,
  MapPin,
  Minus,
  Package,
  Plus,
  Receipt,
  Truck,
  Wallet,
  Zap,
} from 'lucide-react'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import {
  PixelLoader,
  type BrowserPixel,
  firePixelEvent,
  generateEventId,
} from '@/components/pixels/PixelLoader'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  type PickedDestination,
  DestinationPicker,
} from '@/components/order-system/DestinationPicker'
import { formatNumber } from '@/lib/format'

interface PublicVariant {
  id: string
  name: string
  price: number
  weightGrams: number
  stock: number | null
  imageUrl: string | null
}

interface PublicProduct {
  id: string
  name: string
  description: string | null
  price: number
  weightGrams: number
  imageUrl: string | null
  // Galeri foto produk untuk carousel. Server fallback ke [imageUrl] kalau
  // produk lama belum punya `images` array.
  images: string[]
  stock: number | null
  flashSaleActive: boolean
  flashSalePrice: number | null
  flashSaleStartAt: string | null
  flashSaleEndAt: string | null
  flashSaleQuota: number | null
  flashSaleSold: number
  variants?: PublicVariant[]
}

// Composite key untuk qty state — kalau produk punya varian, key = "pid:vid"
// supaya varian beda di-track terpisah. Kalau gak ada varian, key = pid.
function lineKey(productId: string, variantId: string | null): string {
  return variantId ? `${productId}:${variantId}` : productId
}

interface FormProps {
  slug: string
  name: string
  description: string | null
  acceptCod: boolean
  acceptTransfer: boolean
  shippingFlatCod: number | null
  // false = produk digital, alamat & ongkir di-hide di form publik.
  requireShipping: boolean
  showFlashSaleCounter: boolean
  showShippingPromo: boolean
  ownerName: string
}

interface OrderFormPublicProps {
  form: FormProps
  products: PublicProduct[]
  isAvailable: boolean
  hasOriginSetup: boolean
  enabledCouriers: string[]
}

interface CourierService {
  name: string
  code: string
  service: string
  description: string
  cost: number
  etd: string
}

function computeFlashSale(p: PublicProduct): {
  active: boolean
  price: number
  ends?: Date
} {
  if (!p.flashSaleActive || p.flashSalePrice == null) {
    return { active: false, price: p.price }
  }
  const start = p.flashSaleStartAt ? new Date(p.flashSaleStartAt) : null
  const end = p.flashSaleEndAt ? new Date(p.flashSaleEndAt) : null
  const now = new Date()
  if (start && now < start) return { active: false, price: p.price }
  if (end && now > end) return { active: false, price: p.price }
  if (
    p.flashSaleQuota != null &&
    p.flashSaleSold >= p.flashSaleQuota
  ) {
    return { active: false, price: p.price }
  }
  return { active: true, price: p.flashSalePrice, ends: end ?? undefined }
}

// Mini-carousel untuk thumbnail produk di list. Dibuat inline supaya tidak
// nambah dependency carousel eksternal — UX-nya cukup: prev/next + dot
// indicator + swipe (touch) untuk mobile. Saat hanya 1 foto, jatuh ke single
// image (tidak ada arrow/dots).
interface ProductImageCarouselProps {
  images: string[]
  alt: string
  size?: 'sm' | 'md'
}

function ProductImageCarousel({ images, alt, size = 'sm' }: ProductImageCarouselProps) {
  const [idx, setIdx] = useState(0)
  const touchStartX = useRef<number | null>(null)
  const count = images.length

  // Pastikan idx tetap valid kalau images berubah length (mis. produk update).
  useEffect(() => {
    if (idx >= count) setIdx(0)
  }, [count, idx])

  const sizeClass = size === 'md' ? 'size-32' : 'size-20'

  if (count === 0) {
    return (
      <div
        className={`relative ${sizeClass} shrink-0 overflow-hidden rounded-lg bg-warm-100`}
      >
        <div className="flex size-full items-center justify-center text-warm-400">
          <Package className="size-6" />
        </div>
      </div>
    )
  }

  function go(delta: number) {
    setIdx((cur) => (cur + delta + count) % count)
  }

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0]?.clientX ?? null
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current == null) return
    const endX = e.changedTouches[0]?.clientX ?? touchStartX.current
    const delta = endX - touchStartX.current
    if (Math.abs(delta) > 30) go(delta > 0 ? -1 : 1)
    touchStartX.current = null
  }

  return (
    <div
      className={`relative ${sizeClass} shrink-0 overflow-hidden rounded-lg bg-warm-100`}
      onTouchStart={count > 1 ? onTouchStart : undefined}
      onTouchEnd={count > 1 ? onTouchEnd : undefined}
    >
      <Image
        key={images[idx]}
        src={images[idx]}
        alt={alt}
        fill
        sizes={size === 'md' ? '128px' : '80px'}
        className="object-cover"
      />
      {count > 1 && (
        <>
          <button
            type="button"
            aria-label="Foto sebelumnya"
            onClick={(e) => {
              e.stopPropagation()
              go(-1)
            }}
            className="absolute left-1 top-1/2 -translate-y-1/2 rounded-full bg-black/45 p-1 text-white opacity-90 hover:bg-black/65"
          >
            <ChevronLeft className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label="Foto berikutnya"
            onClick={(e) => {
              e.stopPropagation()
              go(1)
            }}
            className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full bg-black/45 p-1 text-white opacity-90 hover:bg-black/65"
          >
            <ChevronRight className="size-3.5" />
          </button>
          <div className="absolute inset-x-0 bottom-1 flex justify-center gap-0.5">
            {images.map((_, i) => (
              <span
                key={i}
                className={`size-1 rounded-full ${
                  i === idx ? 'bg-white' : 'bg-white/50'
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function formatCountdown(ms: number) {
  if (ms <= 0) return '00:00:00'
  const total = Math.floor(ms / 1000)
  const h = String(Math.floor(total / 3600)).padStart(2, '0')
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0')
  const s = String(total % 60).padStart(2, '0')
  return `${h}:${m}:${s}`
}

export function OrderFormPublic({
  form,
  products,
  isAvailable,
  hasOriginSetup,
  enabledCouriers,
}: OrderFormPublicProps) {
  const [qty, setQty] = useState<Record<string, number>>({})

  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [destination, setDestination] = useState<PickedDestination | null>(
    null,
  )
  const [shippingAddress, setShippingAddress] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'COD' | 'TRANSFER'>(
    form.acceptTransfer ? 'TRANSFER' : 'COD',
  )
  const [notes, setNotes] = useState('')

  const [courierOptions, setCourierOptions] = useState<CourierService[]>([])
  const [selectedCourier, setSelectedCourier] = useState<CourierService | null>(
    null,
  )
  const [loadingCourier, setLoadingCourier] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // ─── Pixel Tracking (Phase 2) ────────────────────────────────────────────
  const [pixels, setPixels] = useState<BrowserPixel[]>([])
  // Stable session ID untuk dedup browser+server. Disimpan di sessionStorage
  // supaya bertahan saat refresh, eventId konsisten antara ViewContent dst.
  const sessionId = useMemo(() => {
    if (typeof window === 'undefined') return 'ssr'
    const KEY = `hulao_session_${form.slug}`
    let id = sessionStorage.getItem(KEY)
    if (!id) {
      id = `s_${Math.random().toString(36).slice(2, 10)}_${Date.now()}`
      sessionStorage.setItem(KEY, id)
    }
    return id
  }, [form.slug])
  // Click IDs + UTM dari URL params, persist ke sessionStorage supaya tahan
  // refresh + bisa di-submit walau user pindah tab dan balik.
  const searchParams = useSearchParams()
  const trackingMeta = useMemo(() => {
    if (typeof window === 'undefined') {
      return {
        fbclid: null as string | null,
        gclid: null as string | null,
        ttclid: null as string | null,
        utmSource: null as string | null,
        utmMedium: null as string | null,
        utmCampaign: null as string | null,
      }
    }
    const KEY = `hulao_tracking_${form.slug}`
    const cached = sessionStorage.getItem(KEY)
    const cachedMeta = cached ? JSON.parse(cached) : {}
    const fresh = {
      fbclid: searchParams?.get('fbclid') ?? cachedMeta.fbclid ?? null,
      gclid: searchParams?.get('gclid') ?? cachedMeta.gclid ?? null,
      ttclid: searchParams?.get('ttclid') ?? cachedMeta.ttclid ?? null,
      utmSource: searchParams?.get('utm_source') ?? cachedMeta.utmSource ?? null,
      utmMedium: searchParams?.get('utm_medium') ?? cachedMeta.utmMedium ?? null,
      utmCampaign:
        searchParams?.get('utm_campaign') ?? cachedMeta.utmCampaign ?? null,
    }
    sessionStorage.setItem(KEY, JSON.stringify(fresh))
    return fresh
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.slug])

  // Fetch pixels list saat mount.
  useEffect(() => {
    fetch(`/api/orders/pixels-preview?slug=${encodeURIComponent(form.slug)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success && Array.isArray(d.data?.items)) {
          setPixels(d.data.items)
        }
      })
      .catch(() => {})
  }, [form.slug])

  // Fire ViewContent sekali saat produk siap. PageView auto-fire dari
  // PixelLoader. ViewContent butuh detail produk → tunggu produk loaded.
  const viewContentFired = useRef(false)
  useEffect(() => {
    if (viewContentFired.current) return
    if (pixels.length === 0 || products.length === 0) return
    viewContentFired.current = true
    firePixelEvent(
      'ViewContent',
      {
        content_ids: products.map((p) => p.id),
        content_type: 'product',
        contents: products.map((p) => ({
          id: p.id,
          quantity: 1,
          item_price: computeFlashSale(p).price,
        })),
        currency: 'IDR',
        value: 0,
      },
      generateEventId('ViewContent', sessionId),
    )
  }, [pixels.length, products, sessionId])

  // Fire InitiateCheckout sekali saat user mulai isi nama (first interaction).
  const checkoutInitiated = useRef(false)
  function maybeFireInitiateCheckout() {
    if (checkoutInitiated.current) return
    if (items.length === 0) return
    checkoutInitiated.current = true
    firePixelEvent(
      'InitiateCheckout',
      {
        content_ids: items.map((i) => i.productId),
        contents: items.map((i) => ({
          id: i.productId,
          quantity: i.qty,
          item_price: i.price,
        })),
        num_items: items.reduce((s, i) => s + i.qty, 0),
        currency: 'IDR',
        value: subtotal,
      },
      generateEventId('InitiateCheckout', sessionId),
    )
  }

  const items = useMemo(() => {
    return products.flatMap((p) => {
      // Phase 5: produk dengan varian → satu line per varian (key composite),
      // produk single → satu line dengan key = productId. Flash sale hanya
      // di-apply untuk produk single (tidak ada di varian-level).
      if (p.variants && p.variants.length > 0) {
        return p.variants.flatMap((v) => {
          const q = qty[lineKey(p.id, v.id)] ?? 0
          if (q <= 0) return []
          return [
            {
              productId: p.id,
              variantId: v.id,
              name: `${p.name} – ${v.name}`,
              qty: q,
              price: v.price,
              originalPrice: v.price,
              isFlashSale: false,
              weight: v.weightGrams,
            },
          ]
        })
      }
      const q = qty[p.id] ?? 0
      if (q <= 0) return []
      const fs = computeFlashSale(p)
      return [
        {
          productId: p.id,
          variantId: null as string | null,
          name: p.name,
          qty: q,
          price: fs.price,
          originalPrice: p.price,
          isFlashSale: fs.active,
          weight: p.weightGrams,
        },
      ]
    })
  }, [qty, products])

  const subtotal = items.reduce((sum, i) => sum + i.price * i.qty, 0)
  const flashSaleDiscount = items.reduce(
    (sum, i) =>
      sum + (i.isFlashSale ? (i.originalPrice - i.price) * i.qty : 0),
    0,
  )
  const totalWeight = items.reduce(
    (sum, i) => sum + i.weight * i.qty,
    0,
  )

  // Earliest flash sale end across products → tampil counter.
  const flashEndsAt = useMemo(() => {
    let earliest: Date | null = null
    for (const p of products) {
      const fs = computeFlashSale(p)
      if (fs.active && fs.ends) {
        if (!earliest || fs.ends < earliest) earliest = fs.ends
      }
    }
    return earliest
  }, [products])

  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!flashEndsAt) return
    const i = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(i)
  }, [flashEndsAt])

  // Saat customer pilih destinasi + payment TRANSFER → fetch ongkir.
  // Form digital (requireShipping=false) selalu skip — tidak ada alamat & ongkir.
  useEffect(() => {
    if (!form.requireShipping) {
      setCourierOptions([])
      setSelectedCourier(null)
      return
    }
    if (paymentMethod !== 'TRANSFER') {
      setCourierOptions([])
      setSelectedCourier(null)
      return
    }
    if (!destination || items.length === 0 || enabledCouriers.length === 0) {
      setCourierOptions([])
      setSelectedCourier(null)
      return
    }
    let cancelled = false
    setLoadingCourier(true)
    ;(async () => {
      try {
        const res = await fetch('/api/orders/cost-preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            slug: form.slug,
            destination: destination.id,
            weight: Math.max(totalWeight, 100),
          }),
        })
        const data = await res.json()
        if (cancelled) return
        if (!res.ok || !data.success) {
          toast.error(data.error ?? 'Gagal ambil ongkir')
          setCourierOptions([])
          return
        }
        const services: CourierService[] = data.data.services ?? []
        setCourierOptions(services)
        // Auto-pick service termurah supaya UX cepet.
        const cheapest = services.slice().sort((a, b) => a.cost - b.cost)[0]
        if (cheapest) setSelectedCourier(cheapest)
      } catch {
        if (!cancelled) toast.error('Gagal ambil ongkir')
      } finally {
        if (!cancelled) setLoadingCourier(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [
    paymentMethod,
    destination,
    enabledCouriers,
    totalWeight,
    items.length,
    form.slug,
    form.requireShipping,
  ])

  // Computed totals (preview di client; server tetap re-hitung saat submit).
  // Form digital (requireShipping=false) tidak punya ongkir — selalu 0.
  const shippingCost = !form.requireShipping
    ? 0
    : paymentMethod === 'COD'
      ? form.shippingFlatCod ?? 0
      : selectedCourier?.cost ?? 0
  const total = subtotal + shippingCost  // subsidi belum dihitung di client

  function inc(
    productId: string,
    variantId: string | null,
    max?: number | null,
  ) {
    const key = lineKey(productId, variantId)
    setQty((q) => {
      const cur = q[key] ?? 0
      if (max != null && cur >= max) return q
      const next = { ...q, [key]: cur + 1 }
      // Fire AddToCart saat qty bertambah dari 0 ke 1. Untuk produk dengan
      // varian, content_id pakai variantId supaya pixel bisa attribute ke
      // varian spesifik. Skip increment selanjutnya supaya tidak spam pixel.
      if (cur === 0) {
        const product = products.find((p) => p.id === productId)
        if (product) {
          const variant = variantId
            ? product.variants?.find((v) => v.id === variantId) ?? null
            : null
          const fs = variant
            ? { active: false, price: variant.price }
            : computeFlashSale(product)
          const contentId = variantId ?? productId
          firePixelEvent(
            'AddToCart',
            {
              content_ids: [contentId],
              contents: [
                { id: contentId, quantity: 1, item_price: fs.price },
              ],
              currency: 'IDR',
              value: fs.price,
            },
            generateEventId('AddToCart', `${sessionId}_${contentId}`),
          )
        }
      }
      return next
    })
  }
  function dec(productId: string, variantId: string | null) {
    const key = lineKey(productId, variantId)
    setQty((q) => {
      const cur = q[key] ?? 0
      if (cur <= 0) return q
      return { ...q, [key]: cur - 1 }
    })
  }

  async function handleSubmit() {
    if (items.length === 0) {
      toast.error('Pilih minimal 1 produk')
      return
    }
    if (!customerName.trim() || !customerPhone.trim()) {
      toast.error('Nama & nomor HP wajib diisi')
      return
    }
    if (form.requireShipping) {
      if (!destination) {
        toast.error('Pilih kota tujuan dulu')
        return
      }
      if (!shippingAddress.trim() || shippingAddress.trim().length < 5) {
        toast.error('Alamat lengkap minimal 5 karakter')
        return
      }
      if (paymentMethod === 'TRANSFER' && !selectedCourier) {
        toast.error('Pilih kurir dulu')
        return
      }
    }

    setSubmitting(true)
    try {
      const payload = {
        slug: form.slug,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerEmail: customerEmail.trim() || null,
        items: items.map((i) => ({
          productId: i.productId,
          variantId: i.variantId,
          qty: i.qty,
        })),
        // Saat form digital (!requireShipping) field shipping di-skip —
        // server akan treat shipping cost = 0 dan customerAddress = null.
        shippingDestinationId: form.requireShipping ? destination?.id : undefined,
        shippingProvinceName: form.requireShipping
          ? destination?.province_name
          : null,
        shippingCityName: form.requireShipping ? destination?.city_name : null,
        shippingPostalCode: form.requireShipping ? destination?.zip_code : null,
        shippingAddress: form.requireShipping ? shippingAddress.trim() : null,
        paymentMethod,
        shippingCourier: form.requireShipping
          ? selectedCourier?.code ?? null
          : null,
        shippingService: form.requireShipping
          ? selectedCourier?.service ?? null
          : null,
        notes: notes.trim() || null,
        // Tracking metadata untuk pixel attribution (Phase 2/3).
        ...trackingMeta,
      }
      const res = await fetch('/api/orders/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        toast.error(data.error ?? 'Gagal submit order')
        return
      }
      window.location.href = `/invoice/${data.data.invoiceNumber}`
    } catch {
      toast.error('Terjadi kesalahan jaringan')
    } finally {
      setSubmitting(false)
    }
  }

  if (!isAvailable) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <Package className="mx-auto mb-4 size-14 text-warm-400" />
        <h1 className="font-display text-xl font-bold text-warm-900">
          Form sedang tidak menerima order
        </h1>
        <p className="mt-2 text-sm text-warm-600">
          Coba hubungi penjual langsung untuk konfirmasi.
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 md:py-8">
      <PixelLoader pixels={pixels} />
      {/* Header */}
      <div className="mb-4">
        <h1 className="font-display text-2xl font-bold text-warm-900 md:text-3xl">
          {form.name}
        </h1>
        {form.description && (
          <p className="mt-1 whitespace-pre-line text-sm text-warm-600">
            {form.description}
          </p>
        )}
        <p className="mt-1 text-xs text-warm-500">Penjual: {form.ownerName}</p>
      </div>

      {/* Flash sale countdown */}
      {form.showFlashSaleCounter && flashEndsAt && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50 px-4 py-3">
          <Zap className="size-6 text-amber-600" />
          <div className="flex-1">
            <p className="text-sm font-bold text-amber-900">FLASH SALE</p>
            <p className="text-xs text-amber-800">
              Berakhir dalam:{' '}
              <span className="font-mono font-bold tabular-nums">
                {formatCountdown(flashEndsAt.getTime() - now)}
              </span>
            </p>
          </div>
        </div>
      )}

      {/* Produk list */}
      <Card className="mb-4">
        <CardContent className="p-4">
          <h2 className="mb-3 flex items-center gap-2 font-semibold text-warm-900">
            <Package className="size-4" />
            Pilih Produk
          </h2>
          {products.length === 0 ? (
            <p className="text-sm text-warm-500">
              Tidak ada produk yang tersedia.
            </p>
          ) : (
            <ul className="space-y-3">
              {products.map((p) => {
                const fs = computeFlashSale(p)
                const hasVariants = (p.variants?.length ?? 0) > 0
                const cur = qty[p.id] ?? 0
                return (
                  <li
                    key={p.id}
                    className="rounded-lg border bg-warm-50 p-3"
                  >
                    <div className="flex gap-3">
                      <ProductImageCarousel
                        images={
                          p.images && p.images.length > 0
                            ? p.images
                            : p.imageUrl
                              ? [p.imageUrl]
                              : []
                        }
                        alt={p.name}
                        size={p.images && p.images.length > 1 ? 'md' : 'sm'}
                      />
                      <div className="flex flex-1 flex-col min-w-0">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <p className="font-semibold text-warm-900">{p.name}</p>
                          {!hasVariants && fs.active && (
                            <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                              <Zap className="mr-1 size-3" /> Flash
                            </Badge>
                          )}
                          {hasVariants && (
                            <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">
                              {p.variants!.length} pilihan
                            </Badge>
                          )}
                        </div>
                        {p.description && (
                          <p className="line-clamp-2 text-xs text-warm-600">
                            {p.description}
                          </p>
                        )}
                        {hasVariants ? (
                          <p className="mt-1 text-xs text-warm-500">
                            Pilih varian di bawah
                          </p>
                        ) : (
                          <>
                            <div className="mt-1 flex items-baseline gap-2">
                              <span className="text-base font-bold text-primary-600">
                                Rp {formatNumber(fs.price)}
                              </span>
                              {fs.active && (
                                <span className="text-xs text-warm-500 line-through">
                                  Rp {formatNumber(p.price)}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-warm-500">
                              {p.weightGrams} g
                              {p.stock != null && ` · Stok: ${p.stock}`}
                              {fs.active &&
                                p.flashSaleQuota != null &&
                                ` · ${p.flashSaleSold}/${p.flashSaleQuota} terjual`}
                            </p>
                            <div className="mt-2 flex items-center gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => dec(p.id, null)}
                                disabled={cur <= 0}
                                className="size-8 p-0"
                              >
                                <Minus className="size-3.5" />
                              </Button>
                              <span className="w-10 text-center font-semibold tabular-nums">
                                {cur}
                              </span>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => inc(p.id, null, p.stock)}
                                disabled={p.stock != null && cur >= p.stock}
                                className="size-8 p-0"
                              >
                                <Plus className="size-3.5" />
                              </Button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Daftar varian — satu sub-row per varian dengan qty
                        selector sendiri. */}
                    {hasVariants && (
                      <ul className="mt-3 space-y-2 border-t border-warm-200 pt-3">
                        {p.variants!.map((v) => {
                          const vq = qty[lineKey(p.id, v.id)] ?? 0
                          return (
                            <li
                              key={v.id}
                              className="flex gap-3 rounded-md bg-white p-2"
                            >
                              <div className="size-14 shrink-0 overflow-hidden rounded-md border bg-warm-50">
                                {v.imageUrl || p.imageUrl ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={v.imageUrl ?? p.imageUrl ?? ''}
                                    alt={v.name}
                                    className="size-full object-cover"
                                  />
                                ) : (
                                  <div className="flex size-full items-center justify-center text-warm-400">
                                    <Package className="size-5" />
                                  </div>
                                )}
                              </div>
                              <div className="flex flex-1 flex-col min-w-0">
                                <p className="text-sm font-medium text-warm-900">
                                  {v.name}
                                </p>
                                <div className="flex items-baseline gap-2">
                                  <span className="text-sm font-bold text-primary-600">
                                    Rp {formatNumber(v.price)}
                                  </span>
                                  <span className="text-xs text-warm-500">
                                    {v.weightGrams} g
                                    {v.stock != null && ` · Stok: ${v.stock}`}
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => dec(p.id, v.id)}
                                  disabled={vq <= 0}
                                  className="size-8 p-0"
                                >
                                  <Minus className="size-3.5" />
                                </Button>
                                <span className="w-8 text-center text-sm font-semibold tabular-nums">
                                  {vq}
                                </span>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => inc(p.id, v.id, v.stock)}
                                  disabled={v.stock != null && vq >= v.stock}
                                  className="size-8 p-0"
                                >
                                  <Plus className="size-3.5" />
                                </Button>
                              </div>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Customer info */}
      <Card className="mb-4">
        <CardContent className="space-y-3 p-4">
          <h2 className="flex items-center gap-2 font-semibold text-warm-900">
            <MapPin className="size-4" />
            {form.requireShipping ? 'Data Pengiriman' : 'Data Pemesan'}
          </h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cust-name">Nama Lengkap</Label>
              <Input
                id="cust-name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                onFocus={maybeFireInitiateCheckout}
                placeholder="Andi Pratama"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cust-phone">Nomor HP / WA</Label>
              <Input
                id="cust-phone"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="08123456789"
                inputMode="tel"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cust-email">Email (opsional)</Label>
            <Input
              id="cust-email"
              type="email"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
              placeholder="email@domain.com"
            />
          </div>
          {form.requireShipping && (
            <>
              <div className="space-y-1.5">
                <Label>Kota / Kecamatan / Kelurahan Tujuan</Label>
                <DestinationPicker
                  value={destination}
                  onChange={setDestination}
                  endpoint={`/api/orders/destinations-preview?slug=${encodeURIComponent(form.slug)}`}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cust-addr">Alamat Lengkap</Label>
                <Textarea
                  id="cust-addr"
                  rows={3}
                  value={shippingAddress}
                  onChange={(e) => setShippingAddress(e.target.value)}
                  placeholder="Nama jalan, nomor rumah, RT/RW, patokan…"
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Pengiriman (RajaOngkir options for TRANSFER) */}
      {form.requireShipping && paymentMethod === 'TRANSFER' && (
        <Card className="mb-4">
          <CardContent className="p-4">
            <h2 className="mb-3 flex items-center gap-2 font-semibold text-warm-900">
              <Truck className="size-4" />
              Pengiriman
            </h2>
            {!hasOriginSetup ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                Penjual belum setup origin pengiriman. Coba hubungi langsung.
              </p>
            ) : !destination ? (
              <p className="text-sm text-warm-500">
                Pilih kota tujuan dulu untuk lihat ongkir.
              </p>
            ) : loadingCourier ? (
              <div className="flex items-center gap-2 text-sm text-warm-500">
                <Loader2 className="size-4 animate-spin" />
                Hitung ongkir…
              </div>
            ) : courierOptions.length === 0 ? (
              <p className="text-sm text-warm-500">
                Tidak ada opsi ongkir untuk tujuan ini.
              </p>
            ) : (
              <ul className="space-y-2">
                {courierOptions.map((c) => {
                  const active =
                    selectedCourier?.code === c.code &&
                    selectedCourier?.service === c.service
                  return (
                    <li key={`${c.code}-${c.service}`}>
                      <button
                        type="button"
                        onClick={() => setSelectedCourier(c)}
                        className={`flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left transition-colors ${
                          active
                            ? 'border-primary-500 bg-primary-50'
                            : 'hover:bg-warm-50'
                        }`}
                      >
                        <div>
                          <p className="font-semibold text-warm-900">
                            {c.name} ·{' '}
                            <span className="font-normal">
                              {c.description}
                            </span>
                          </p>
                          <p className="text-xs text-warm-500">
                            Estimasi {c.etd}
                          </p>
                        </div>
                        <p className="font-bold text-primary-600">
                          Rp {formatNumber(c.cost)}
                        </p>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {/* Payment */}
      <Card className="mb-4">
        <CardContent className="p-4">
          <h2 className="mb-3 flex items-center gap-2 font-semibold text-warm-900">
            <Wallet className="size-4" />
            Cara Bayar
          </h2>
          <div className="grid grid-cols-2 gap-2">
            {form.acceptCod && (
              <button
                type="button"
                onClick={() => setPaymentMethod('COD')}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  paymentMethod === 'COD'
                    ? 'border-primary-500 bg-primary-50'
                    : 'hover:bg-warm-50'
                }`}
              >
                <p className="font-semibold text-warm-900">COD</p>
                <p className="text-xs text-warm-500">Bayar di tempat</p>
              </button>
            )}
            {form.acceptTransfer && (
              <button
                type="button"
                onClick={() => setPaymentMethod('TRANSFER')}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  paymentMethod === 'TRANSFER'
                    ? 'border-primary-500 bg-primary-50'
                    : 'hover:bg-warm-50'
                }`}
              >
                <p className="flex items-center gap-1 font-semibold text-warm-900">
                  <CreditCard className="size-3.5" /> Transfer Bank
                </p>
                <p className="text-xs text-warm-500">Upload bukti transfer</p>
              </button>
            )}
          </div>
          <div className="mt-3 space-y-1.5">
            <Label htmlFor="cust-notes">Catatan untuk Penjual (opsional)</Label>
            <Textarea
              id="cust-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Mis. tolong jangan kirim hari Minggu"
            />
          </div>
        </CardContent>
      </Card>

      {/* Ringkasan */}
      <Card className="mb-4">
        <CardContent className="space-y-1.5 p-4">
          <h2 className="mb-2 flex items-center gap-2 font-semibold text-warm-900">
            <Receipt className="size-4" />
            Ringkasan
          </h2>
          {items.length === 0 ? (
            <p className="text-sm text-warm-500">Belum ada produk dipilih.</p>
          ) : (
            <>
              {items.map((i) => (
                <div
                  key={i.productId}
                  className="flex justify-between text-sm"
                >
                  <span className="truncate">
                    {i.name} × {i.qty}
                  </span>
                  <span>Rp {formatNumber(i.price * i.qty)}</span>
                </div>
              ))}
              <div className="my-2 border-t" />
              <div className="flex justify-between text-sm">
                <span>Subtotal</span>
                <span>Rp {formatNumber(subtotal)}</span>
              </div>
              {flashSaleDiscount > 0 && (
                <div className="flex justify-between text-sm text-amber-700">
                  <span>Hemat Flash Sale</span>
                  <span>-Rp {formatNumber(flashSaleDiscount)}</span>
                </div>
              )}
              {form.requireShipping && (
                <div className="flex justify-between text-sm">
                  <span>
                    Ongkir{' '}
                    {paymentMethod === 'TRANSFER' && selectedCourier
                      ? `${selectedCourier.code.toUpperCase()} ${selectedCourier.service}`
                      : paymentMethod === 'COD'
                        ? '(COD)'
                        : ''}
                  </span>
                  <span>
                    {shippingCost > 0
                      ? `Rp ${formatNumber(shippingCost)}`
                      : '—'}
                  </span>
                </div>
              )}
              {form.requireShipping && form.showShippingPromo && (
                <p className="text-xs text-warm-500">
                  *Subsidi/promo ongkir akan dihitung otomatis saat submit.
                </p>
              )}
              <div className="my-2 border-t" />
              <div className="flex justify-between text-base font-bold">
                <span>Total</span>
                <span className="text-primary-600">
                  Rp {formatNumber(total)}
                </span>
              </div>
              {paymentMethod === 'TRANSFER' && (
                <p className="text-xs text-warm-500">
                  *Total final akan ditambahkan kode unik 100-999 supaya
                  pembayaran kamu mudah diverifikasi.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Button
        size="lg"
        className="w-full"
        onClick={handleSubmit}
        disabled={submitting || items.length === 0}
      >
        {submitting ? 'Memproses…' : 'Pesan Sekarang'}
      </Button>

      <p className="mt-4 text-center text-xs text-warm-400">
        Powered by Hulao
      </p>
    </div>
  )
}
