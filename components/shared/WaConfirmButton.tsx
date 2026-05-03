'use client'

// WaConfirmButton — generate link wa.me ke admin dengan pesan konfirmasi
// transfer pre-filled. Fetch nomor admin dari /api/settings/wa-admin
// (public endpoint, tidak butuh auth).
//
// Dipakai di kedua checkout: token (ManualCheckoutDetail) dan LP upgrade.
import { Loader2, MessageCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'

interface Props {
  // Pesan yang sudah jadi — caller yang format isi sesuai konteks (token vs LP).
  message: string
  // Helper text di bawah tombol.
  helperText?: string
  className?: string
}

export function WaConfirmButton({ message, helperText, className }: Props) {
  const [waNumber, setWaNumber] = useState<string | null>(null)
  const [isLoading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch('/api/settings/wa-admin')
      .then((r) => r.json())
      .then((j: { success: boolean; data?: { waAdmin: string | null } }) => {
        if (cancelled) return
        if (j.success && j.data) setWaNumber(j.data.waAdmin)
      })
      .catch(() => {
        // Silent — tombol akan tampil disabled.
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  function handleClick() {
    if (!waNumber) {
      toast.error('Nomor WA admin belum diatur. Hubungi admin lewat email.')
      return
    }
    const url = `https://wa.me/${waNumber}?text=${encodeURIComponent(message)}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className={className}>
      <Button
        type="button"
        onClick={handleClick}
        disabled={isLoading || !waNumber}
        size="lg"
        className="w-full bg-emerald-600 font-semibold text-white hover:bg-emerald-700"
        title={
          waNumber
            ? `Buka WhatsApp ke ${waNumber}`
            : 'Nomor WA admin belum diatur'
        }
      >
        {isLoading ? (
          <Loader2 className="mr-2 size-4 animate-spin" />
        ) : (
          <MessageCircle className="mr-2 size-4" />
        )}
        Konfirmasi via WhatsApp
      </Button>
      {helperText && (
        <p className="mt-1.5 text-center text-xs text-warm-500">{helperText}</p>
      )}
    </div>
  )
}

// Helper untuk build pesan token purchase.
export function buildTokenConfirmMessage(input: {
  packageName: string
  tokenAmount: number
  userName: string | null
  userEmail: string
  totalAmount: number
  uniqueCode: number
  hasProof: boolean
}): string {
  const today = new Date().toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  const lines = [
    `Halo Admin Hulao, saya sudah transfer untuk pembelian ${input.packageName} ${input.tokenAmount.toLocaleString('id-ID')} token.`,
    '',
    `Nama: ${input.userName ?? '-'}`,
    `Email: ${input.userEmail}`,
    `Total Transfer: Rp ${input.totalAmount.toLocaleString('id-ID')} (termasuk kode unik ${input.uniqueCode})`,
    `Tanggal: ${today}`,
  ]
  if (input.hasProof) {
    lines.push('', 'Bukti transfer sudah saya upload di dashboard.')
  }
  return lines.join('\n')
}

// Helper untuk build pesan LP upgrade.
export function buildLpUpgradeConfirmMessage(input: {
  packageName: string
  tier: string
  maxLp: number
  maxStorageMB: number
  userName: string | null
  userEmail: string
  totalAmount: number
  uniqueCode: number
  hasProof: boolean
}): string {
  const today = new Date().toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  const lpLimit = input.maxLp >= 999 ? 'unlimited' : `${input.maxLp} LP`
  const lines = [
    `Halo Admin Hulao, saya sudah transfer untuk upgrade Paket LP ${input.packageName} (${input.tier}).`,
    '',
    `Nama: ${input.userName ?? '-'}`,
    `Email: ${input.userEmail}`,
    `Paket: ${input.packageName} — ${lpLimit}, ${input.maxStorageMB} MB storage`,
    `Total Transfer: Rp ${input.totalAmount.toLocaleString('id-ID')} (termasuk kode unik ${input.uniqueCode})`,
    `Tanggal: ${today}`,
  ]
  if (input.hasProof) {
    lines.push('', 'Bukti transfer sudah saya upload di dashboard.')
  }
  return lines.join('\n')
}
