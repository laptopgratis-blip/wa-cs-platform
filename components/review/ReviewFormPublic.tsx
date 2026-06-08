'use client'

// Form testimoni publik 1-klik (dipakai di /review/[orderId]). Rating bintang +
// teks + upload foto + toggle "sudah dicoba". Submit ke /api/review/[orderId].
import { Camera, CheckCircle2, Loader2, Star, X } from 'lucide-react'
import { useState } from 'react'

interface ExistingReview {
  rating: number
  reviewText: string | null
  photoUrls: string[]
  triedProduct: boolean
}

export function ReviewFormPublic({
  orderId,
  token,
  customerName,
  productName,
  storeName,
  existing,
}: {
  orderId: string
  token: string
  customerName: string
  productName: string | null
  storeName: string
  existing: ExistingReview | null
}) {
  const [rating, setRating] = useState(existing?.rating ?? 0)
  const [hover, setHover] = useState(0)
  const [tried, setTried] = useState(existing?.triedProduct ?? true)
  const [text, setText] = useState(existing?.reviewText ?? '')
  const [photos, setPhotos] = useState<string[]>(existing?.photoUrls ?? [])
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (photos.length >= 5) {
      setError('Maksimal 5 foto')
      return
    }
    setUploading(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(
        `/api/review/${encodeURIComponent(orderId)}/upload-photo?t=${encodeURIComponent(token)}`,
        { method: 'POST', body: fd },
      )
      const json = (await res.json()) as {
        success: boolean
        data?: { url: string }
        error?: string
      }
      if (json.success && json.data) {
        setPhotos((p) => [...p, json.data!.url])
      } else {
        setError(json.error ?? 'Gagal upload foto')
      }
    } catch {
      setError('Gagal upload foto')
    } finally {
      setUploading(false)
    }
  }

  async function handleSubmit() {
    if (rating < 1) {
      setError('Kasih bintang dulu ya ⭐')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/review/${encodeURIComponent(orderId)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token,
          rating,
          reviewText: text.trim() || undefined,
          triedProduct: tried,
          photoUrls: photos,
        }),
      })
      const json = (await res.json()) as { success: boolean; error?: string }
      if (json.success) {
        setDone(true)
      } else {
        setError(json.error ?? 'Gagal kirim testimoni')
      }
    } catch {
      setError('Gagal kirim testimoni')
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-orange-50 via-amber-50 to-white p-6 text-center">
        <CheckCircle2 className="h-16 w-16 text-emerald-500" aria-hidden="true" />
        <h1 className="mt-4 text-xl font-semibold text-zinc-900">
          Terima kasih, {customerName}! 🙏
        </h1>
        <p className="mt-2 max-w-sm text-sm text-zinc-600">
          Testimoni kamu sudah kami terima. Sangat membantu {storeName} jadi lebih
          baik. Sampai jumpa di order berikutnya ✨
        </p>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col items-center bg-gradient-to-br from-orange-50 via-amber-50 to-white p-4 py-8">
      <div className="w-full max-w-md rounded-3xl border bg-white p-6 shadow-xl">
        <h1 className="text-center text-lg font-semibold text-zinc-900">
          Gimana pengalamannya, {customerName}?
        </h1>
        {productName ? (
          <p className="mt-1 text-center text-sm text-zinc-500">
            Untuk: <strong>{productName}</strong>
          </p>
        ) : null}

        {/* Rating bintang */}
        <div className="mt-5 flex justify-center gap-1.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(n)}
              onMouseEnter={() => setHover(n)}
              onMouseLeave={() => setHover(0)}
              aria-label={`${n} bintang`}
              className="transition active:scale-90"
            >
              <Star
                className={`h-9 w-9 ${
                  (hover || rating) >= n
                    ? 'fill-amber-400 text-amber-400'
                    : 'text-zinc-300'
                }`}
              />
            </button>
          ))}
        </div>

        {/* Sudah dicoba? */}
        <div className="mt-5">
          <p className="mb-1.5 text-sm font-medium text-zinc-700">
            Sudah sempat dicoba/dipakai?
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setTried(true)}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                tried
                  ? 'border-orange-500 bg-orange-50 text-orange-700'
                  : 'border-zinc-200 text-zinc-600'
              }`}
            >
              Sudah dicoba
            </button>
            <button
              type="button"
              onClick={() => setTried(false)}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                !tried
                  ? 'border-orange-500 bg-orange-50 text-orange-700'
                  : 'border-zinc-200 text-zinc-600'
              }`}
            >
              Belum sempat
            </button>
          </div>
        </div>

        {/* Teks testimoni */}
        <div className="mt-5">
          <label
            htmlFor="review-text"
            className="mb-1.5 block text-sm font-medium text-zinc-700"
          >
            Ceritakan pengalamanmu (opsional)
          </label>
          <textarea
            id="review-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            maxLength={2000}
            placeholder="Misal: produknya bagus, pengiriman cepat, hasil terasa…"
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
        </div>

        {/* Foto */}
        <div className="mt-4">
          <p className="mb-1.5 text-sm font-medium text-zinc-700">
            Foto produk (opsional, maks 5)
          </p>
          <div className="flex flex-wrap gap-2">
            {photos.map((url) => (
              <div key={url} className="relative h-16 w-16">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt="Foto testimoni"
                  className="h-16 w-16 rounded-lg object-cover"
                />
                <button
                  type="button"
                  onClick={() => setPhotos((p) => p.filter((u) => u !== url))}
                  aria-label="Hapus foto"
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-zinc-800 text-white"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {photos.length < 5 ? (
              <label className="flex h-16 w-16 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg border-2 border-dashed border-zinc-300 text-zinc-400 hover:border-orange-400 hover:text-orange-500">
                {uploading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Camera className="h-5 w-5" />
                )}
                <span className="text-[10px]">Foto</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handleUpload}
                  disabled={uploading}
                />
              </label>
            ) : null}
          </div>
        </div>

        {error ? (
          <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || uploading}
          className="mt-5 flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-orange-600 disabled:bg-zinc-300"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Mengirim…
            </>
          ) : (
            'Kirim Testimoni'
          )}
        </button>
        <p className="mt-3 text-center text-[11px] text-zinc-400">
          Powered by Hulao
        </p>
      </div>
    </div>
  )
}
