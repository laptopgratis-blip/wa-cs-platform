'use client'

// PostPublishReturnBanner — penanda intent "user mau topup setelah publish LP,
// lalu lanjut ke generator 15 status WA". Dipasang di /billing & /checkout/*.
//
// Flow:
//   1. User publish LP → modal Selamat → CTA → /billing?from=post-publish&lpId=X.
//   2. Komponen ini auto-save {lpId} ke sessionStorage saat first mount.
//   3. Setiap halaman billing/checkout berikutnya, render banner kontekstual:
//      - paymentStatus=null/PENDING → info ringan "Setelah berhasil top-up,
//        kamu langsung dibawa ke generator".
//      - paymentStatus='COMPLETED' → CTA prominent "Lanjut bikin konten LP".
//      - paymentStatus='AWAITING_REVIEW' (manual transfer) → "Setelah admin
//        konfirmasi, saldo masuk lalu kamu otomatis dibawa kembali".
//   4. Klik CTA → bersih sessionStorage + push ke /content/post-publish/{lpId}.

import { ArrowRight, Sparkles } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'

const STORAGE_KEY = 'hulao:postPublishReturn'
const TTL_MS = 60 * 60 * 1000 // 1 jam — flow topup maksimal masuk akal

interface StoredIntent {
  lpId: string
  ts: number
}

function readIntent(): StoredIntent | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredIntent
    if (!parsed?.lpId) return null
    if (Date.now() - parsed.ts > TTL_MS) {
      window.sessionStorage.removeItem(STORAGE_KEY)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

function writeIntent(lpId: string) {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ lpId, ts: Date.now() } satisfies StoredIntent),
    )
  } catch {
    /* sessionStorage disabled / quota — non-fatal */
  }
}

function clearIntent() {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    /* abaikan */
  }
}

type Status = 'PENDING' | 'COMPLETED' | 'AWAITING_REVIEW' | null

interface Props {
  /**
   * Status pembayaran saat ini.
   *   - null: bukan halaman checkout (mis. /billing) — tampil banner info.
   *   - 'PENDING': checkout berjalan, tampil banner info.
   *   - 'AWAITING_REVIEW': manual transfer sudah upload bukti, menunggu admin.
   *   - 'COMPLETED': pembayaran sukses / saldo sudah masuk — tampil CTA besar.
   */
  paymentStatus?: Status
}

export function PostPublishReturnBanner({ paymentStatus = null }: Props) {
  const [lpId, setLpId] = useState<string | null>(null)

  // Capture intent dari URL atau sessionStorage. Pakai window.location di
  // useEffect (bukan useSearchParams) supaya tidak butuh Suspense boundary
  // di server component parent.
  useEffect(() => {
    const url = new URL(window.location.href)
    const fromQuery =
      url.searchParams.get('from') === 'post-publish'
        ? url.searchParams.get('lpId')
        : null
    if (fromQuery) {
      writeIntent(fromQuery)
      setLpId(fromQuery)
      return
    }
    const stored = readIntent()
    if (stored) setLpId(stored.lpId)
  }, [])

  if (!lpId) return null

  const returnHref = `/content/post-publish/${lpId}?paid=1`

  // Sukses → CTA prominent.
  if (paymentStatus === 'COMPLETED') {
    return (
      <div className="rounded-xl border-2 border-emerald-300 bg-gradient-to-br from-emerald-50 via-white to-emerald-50 p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm">
              <Sparkles className="size-4" />
            </span>
            <div>
              <div className="font-display text-base font-bold text-emerald-900">
                Saldo masuk! Saatnya bikin konten WA.
              </div>
              <p className="mt-0.5 text-xs text-emerald-800">
                Lanjut ke generator 15 status WA dari LP yang baru kamu publish.
              </p>
            </div>
          </div>
          <Link
            href={returnHref}
            onClick={clearIntent}
            className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-emerald-700"
          >
            Lanjut Bikin Konten
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>
    )
  }

  // Manual transfer menunggu admin.
  if (paymentStatus === 'AWAITING_REVIEW') {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        <div className="flex items-start gap-2">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <div>
            Bukti transfer sudah masuk. Setelah admin konfirmasi (maks 1×24
            jam), kamu langsung dibawa kembali ke{' '}
            <Link
              href={returnHref}
              onClick={clearIntent}
              className="font-semibold underline underline-offset-2 hover:text-amber-700"
            >
              generator 15 status WA
            </Link>
            .
          </div>
        </div>
      </div>
    )
  }

  // Default: PENDING / null → info ringan.
  return (
    <div className="rounded-xl border border-primary-200 bg-primary-50/60 p-3 text-sm text-primary-900">
      <div className="flex items-start gap-2">
        <Sparkles className="mt-0.5 size-4 shrink-0 text-primary-500" />
        <div>
          <strong>Top-up untuk lanjut bikin 15 status WA dari LP-mu.</strong>{' '}
          Setelah berhasil, kamu langsung dibawa ke generator. Atau cek dulu{' '}
          <Link
            href={`/content/post-publish/${lpId}`}
            className="font-semibold underline underline-offset-2 hover:text-primary-700"
          >
            3 sample gratis
          </Link>{' '}
          tanpa harus top-up.
        </div>
      </div>
    </div>
  )
}
