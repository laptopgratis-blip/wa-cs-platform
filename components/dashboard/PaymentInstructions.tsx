'use client'

// Instruksi pembayaran — accordion collapsible yang menampilkan langkah-langkah
// bayar per channel (Internet Banking, Mobile Banking, ATM, dll).
// Hanya ditampilkan untuk DIRECT channels (VA, Convenience Store).
import { ChevronDown, ListOrdered } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface InstructionGroup {
  title: string
  steps: string[]
}

interface PaymentInstructionsProps {
  channelCode: string
  payCode: string | null // untuk replace {{pay_code}} di instruksi
}

export function PaymentInstructions({
  channelCode,
  payCode,
}: PaymentInstructionsProps) {
  const [instructions, setInstructions] = useState<InstructionGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openIndex, setOpenIndex] = useState<number | null>(0)

  useEffect(() => {
    async function fetchInstructions() {
      try {
        const res = await fetch(
          `/api/payment/instructions?code=${encodeURIComponent(channelCode)}`,
        )
        const json = (await res.json()) as {
          success: boolean
          data?: InstructionGroup[]
          error?: string
        }
        if (json.success && json.data) {
          setInstructions(json.data)
        } else {
          setError(json.error ?? 'Gagal memuat instruksi')
        }
      } catch {
        setError('Gagal menghubungi server')
      } finally {
        setLoading(false)
      }
    }
    fetchInstructions()
  }, [channelCode])

  function replacePayCode(text: string): string {
    if (!payCode) return text
    return text.replace(/\{\{pay_code\}\}/g, payCode)
  }

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-24 rounded-lg" />
      </div>
    )
  }

  if (error || instructions.length === 0) {
    return null // Jangan tampilkan apa-apa kalau gagal — non-blocking.
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-semibold text-warm-700">
        <ListOrdered className="size-4" />
        Cara Pembayaran
      </div>

      <div className="overflow-hidden rounded-xl border border-warm-200">
        {instructions.map((group, idx) => {
          const isOpen = openIndex === idx

          return (
            <div
              key={group.title}
              className={cn(
                'border-b border-warm-200 last:border-b-0',
              )}
            >
              <button
                type="button"
                className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-warm-800 transition-colors hover:bg-warm-50"
                onClick={() => setOpenIndex(isOpen ? null : idx)}
              >
                <span>{group.title}</span>
                <ChevronDown
                  className={cn(
                    'size-4 text-warm-400 transition-transform',
                    isOpen && 'rotate-180',
                  )}
                />
              </button>

              {isOpen && (
                <div className="border-t border-warm-100 bg-warm-50/30 px-4 py-3">
                  <ol className="list-decimal space-y-1.5 pl-4 text-sm text-warm-600">
                    {group.steps.map((step, sIdx) => (
                      <li
                        key={sIdx}
                        className="leading-relaxed"
                        dangerouslySetInnerHTML={{
                          __html: replacePayCode(step),
                        }}
                      />
                    ))}
                  </ol>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
