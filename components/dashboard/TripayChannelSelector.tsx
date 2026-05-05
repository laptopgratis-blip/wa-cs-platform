'use client'

// Selector channel pembayaran Tripay — tampil semua channel aktif yang di-group
// (Virtual Account, E-Wallet, QRIS, Convenience Store). User pilih salah satu
// sebelum order dibuat.
import { Loader2 } from 'lucide-react'
import Image from 'next/image'
import { useEffect, useState } from 'react'

import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

import { formatRupiah } from '@/lib/format'

interface ChannelData {
  group: string
  code: string
  name: string
  type: 'direct' | 'redirect'
  fee_customer: { flat: number; percent: number }
  total_fee: { flat: number; percent: string }
  minimum_amount: number
  maximum_amount: number
  icon_url: string
  active: boolean
}

interface TripayChannelSelectorProps {
  amount: number // harga paket
  onSelect: (channel: ChannelData) => void
  selectedCode: string | null
}

export function TripayChannelSelector({
  amount,
  onSelect,
  selectedCode,
}: TripayChannelSelectorProps) {
  const [channels, setChannels] = useState<ChannelData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchChannels() {
      try {
        const res = await fetch('/api/payment/channels')
        const json = (await res.json()) as {
          success: boolean
          data?: ChannelData[]
          error?: string
        }
        if (!json.success || !json.data) {
          setError(json.error ?? 'Gagal memuat channel')
          return
        }
        // Filter channel yang amount-nya sesuai range.
        const valid = json.data.filter(
          (ch) => amount >= ch.minimum_amount && amount <= ch.maximum_amount,
        )

        // Deduplicate QRIS variants — hanya ambil satu, rename ke "QRIS".
        let hasQris = false
        const deduped = valid.filter((ch) => {
          if (ch.code.startsWith('QRIS')) {
            if (hasQris) return false
            hasQris = true
            ch.name = 'QRIS'
            return true
          }
          return true
        })

        setChannels(deduped)
      } catch {
        setError('Gagal menghubungi server')
      } finally {
        setLoading(false)
      }
    }
    fetchChannels()
  }, [amount])

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <div className="grid gap-2 sm:grid-cols-2">
              <Skeleton className="h-20 rounded-xl" />
              <Skeleton className="h-20 rounded-xl" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        {error}
      </div>
    )
  }

  if (channels.length === 0) {
    return (
      <div className="rounded-lg border border-warm-200 bg-warm-50 p-4 text-sm text-warm-600">
        Tidak ada channel pembayaran yang tersedia untuk nominal ini.
      </div>
    )
  }

  // Group channels by group name.
  const groups: Record<string, ChannelData[]> = {}
  for (const ch of channels) {
    const g = ch.group || 'Lainnya'
    if (!groups[g]) groups[g] = []
    groups[g].push(ch)
  }

  function estimateCustomerFee(ch: ChannelData): number {
    const flat = ch.fee_customer.flat
    const percent = ch.fee_customer.percent
    return flat + Math.ceil((amount * percent) / 100)
  }

  return (
    <div className="space-y-5">
      {Object.entries(groups).map(([groupName, groupChannels]) => (
        <div key={groupName} className="space-y-2.5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-warm-500">
            {groupName}
          </h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {groupChannels.map((ch) => {
              const isSelected = selectedCode === ch.code
              const customerFee = estimateCustomerFee(ch)

              return (
                <Card
                  key={ch.code}
                  className={cn(
                    'cursor-pointer rounded-xl border-2 transition-all hover:shadow-md',
                    isSelected
                      ? 'border-primary-500 bg-primary-50/50 shadow-md ring-1 ring-primary-200'
                      : 'border-warm-200 hover:border-primary-300',
                  )}
                  onClick={() => onSelect(ch)}
                >
                  <CardContent className="flex items-center gap-3 p-3.5">
                    {/* Icon */}
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-warm-100">
                      <Image
                        src={ch.icon_url}
                        alt={ch.name}
                        width={28}
                        height={28}
                        className="object-contain"
                        unoptimized
                      />
                    </div>

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-warm-900 dark:text-warm-50">
                        {ch.name}
                      </div>
                      <div className="mt-0.5 text-xs text-warm-500">
                        {customerFee > 0 ? (
                          <>Biaya: {formatRupiah(customerFee)}</>
                        ) : (
                          <>Tanpa biaya tambahan</>
                        )}
                      </div>
                    </div>

                    {/* Radio */}
                    <div
                      className={cn(
                        'flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                        isSelected
                          ? 'border-primary-500 bg-primary-500'
                          : 'border-warm-300',
                      )}
                    >
                      {isSelected && (
                        <div className="size-2 rounded-full bg-white" />
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
