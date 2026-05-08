'use client'

// Floating action bar di bawah saat user select 1+ order. Posisi sticky-bottom
// supaya selalu accessible saat scroll panjang.
import { Check, Loader2, Package, PackageCheck, X } from 'lucide-react'

import { Button } from '@/components/ui/button'

import type { QuickAction } from './types'

interface Props {
  selectedCount: number
  busy: boolean
  onAction: (action: QuickAction) => void
  onClear: () => void
}

export function OrdersBulkActionBar({
  selectedCount,
  busy,
  onAction,
  onClear,
}: Props) {
  if (selectedCount === 0) return null

  return (
    <div className="sticky bottom-2 z-20 mx-auto flex max-w-3xl flex-wrap items-center gap-2 rounded-xl border border-primary-300 bg-white p-3 shadow-lg dark:bg-warm-950">
      <span className="text-sm font-medium">
        {busy && <Loader2 className="mr-1 inline size-3 animate-spin" />}
        {selectedCount} dipilih
      </span>
      <div className="ml-auto flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => onAction('mark_paid')}
        >
          <Check className="mr-1 size-3" /> Lunas
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => onAction('mark_shipped')}
        >
          <Package className="mr-1 size-3" /> Dikirim
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => onAction('mark_delivered')}
        >
          <PackageCheck className="mr-1 size-3" /> Selesai
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          className="text-destructive hover:bg-destructive/10"
          onClick={() => onAction('reject')}
        >
          <X className="mr-1 size-3" /> Tolak
        </Button>
        <Button size="sm" variant="ghost" onClick={onClear} disabled={busy}>
          Batal
        </Button>
      </div>
    </div>
  )
}
