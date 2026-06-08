'use client'

// Halaman publik konfirmasi "sudah diterima" (/diterima/[orderId]). Tombol
// eksplisit (bukan auto on-load) supaya bot preview link WA tak ikut konfirmasi.
import { CheckCircle2, Loader2, PackageCheck, Star } from 'lucide-react'
import { useState } from 'react'

export function ConfirmReceivedPublic({
  orderId,
  token,
  customerName,
  alreadyDelivered,
  reviewUrl,
}: {
  orderId: string
  token: string
  customerName: string
  alreadyDelivered: boolean
  reviewUrl: string
}) {
  const [confirmed, setConfirmed] = useState(alreadyDelivered)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/review/${encodeURIComponent(orderId)}/confirm-received`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ token }),
        },
      )
      const json = (await res.json()) as { success: boolean; error?: string }
      if (json.success) setConfirmed(true)
      else setError(json.error ?? 'Gagal konfirmasi')
    } catch {
      setError('Gagal konfirmasi')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-orange-50 via-amber-50 to-white p-6 text-center">
      <div className="w-full max-w-sm rounded-3xl border bg-white p-7 shadow-xl">
        {confirmed ? (
          <>
            <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-500" />
            <h1 className="mt-4 text-xl font-semibold text-zinc-900">
              Makasih, {customerName}! 🙏
            </h1>
            <p className="mt-2 text-sm text-zinc-600">
              Pesanan ditandai sudah diterima. Sudah sempat dicoba? Bantu kami
              dengan testimoni singkat ya ✨
            </p>
            <a
              href={reviewUrl}
              className="mt-5 flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-orange-600"
            >
              <Star className="h-4 w-4" /> Beri Testimoni
            </a>
          </>
        ) : (
          <>
            <PackageCheck className="mx-auto h-16 w-16 text-orange-500" />
            <h1 className="mt-4 text-xl font-semibold text-zinc-900">
              Halo {customerName} 👋
            </h1>
            <p className="mt-2 text-sm text-zinc-600">
              Pesananmu sudah sampai? Klik tombol di bawah untuk konfirmasi.
            </p>
            {error ? (
              <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            ) : null}
            <button
              type="button"
              onClick={confirm}
              disabled={loading}
              className="mt-5 flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-orange-600 disabled:bg-zinc-300"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Memproses…
                </>
              ) : (
                'Ya, sudah saya terima'
              )}
            </button>
          </>
        )}
        <p className="mt-3 text-center text-[11px] text-zinc-400">Powered by Hulao</p>
      </div>
    </div>
  )
}
