'use client'

// Modal untuk pilih kolom yang aktif di /pesanan. Group by category.
// Search-able (untuk daftar 25+ kolom).
import { Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  DEFAULT_VISIBLE_COLUMNS,
  ORDER_COLUMNS,
  ORDER_COLUMN_CATEGORIES,
  type OrderColumn,
  type OrderColumnCategory,
} from '@/lib/order-columns'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  visibleColumns: string[]
  onSave: (columns: string[]) => void
}

export function ColumnPickerModal({
  open,
  onOpenChange,
  visibleColumns,
  onSave,
}: Props) {
  const [selected, setSelected] = useState<string[]>(visibleColumns)
  const [search, setSearch] = useState('')

  // Sync state saat modal dibuka ulang dengan visible berbeda.
  useEffect(() => {
    if (open) setSelected(visibleColumns)
  }, [open, visibleColumns])

  const grouped = useMemo(() => {
    const out: Record<OrderColumnCategory, OrderColumn[]> = {
      order: [],
      customer: [],
      payment: [],
      shipping: [],
      tracking: [],
      others: [],
    }
    const term = search.trim().toLowerCase()
    for (const col of ORDER_COLUMNS) {
      if (term && !col.label.toLowerCase().includes(term)) continue
      out[col.category].push(col)
    }
    return out
  }, [search])

  function toggle(key: string) {
    setSelected((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    )
  }

  function handleSave() {
    if (selected.length === 0) return
    onSave(selected)
    onOpenChange(false)
  }

  function handleResetDefault() {
    setSelected(DEFAULT_VISIBLE_COLUMNS)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>Atur Kolom Pesanan</DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-warm-400" />
          <Input
            placeholder="Cari kolom…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="max-h-[55vh] space-y-5 overflow-y-auto pr-1">
          {(Object.entries(grouped) as Array<[OrderColumnCategory, OrderColumn[]]>).map(
            ([cat, cols]) => {
              if (cols.length === 0) return null
              return (
                <div key={cat}>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-warm-500">
                    {ORDER_COLUMN_CATEGORIES[cat]}
                  </h3>
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {cols.map((col) => (
                      <label
                        key={col.key}
                        className="flex cursor-pointer items-center gap-2 rounded-md p-1.5 hover:bg-warm-50 dark:hover:bg-warm-900/40"
                      >
                        <Checkbox
                          checked={selected.includes(col.key)}
                          onCheckedChange={() => toggle(col.key)}
                        />
                        <span className="text-sm">{col.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )
            },
          )}
        </div>

        <DialogFooter className="flex flex-row items-center justify-between border-t pt-3 sm:justify-between">
          <span className="text-xs text-warm-500">
            {selected.length} kolom dipilih
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={handleResetDefault}>
              Reset default
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Batal
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={selected.length === 0}
            >
              Simpan
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
