'use client'

// Hook untuk load + save preference view halaman /pesanan ke server.
// Save di-debounce 500ms supaya toggle kolom yang cepat-cepat tidak hammer API.
import { useCallback, useEffect, useRef, useState } from 'react'

import { DEFAULT_VISIBLE_COLUMNS, resolveVisibleColumns } from '@/lib/order-columns'

export interface ViewPreference {
  visibleColumns: string[]
  columnOrder: string[]
  filters: Record<string, unknown> | null
  sortColumn: string | null
  sortDirection: 'asc' | 'desc' | null
  pageSize: number
}

const FALLBACK: ViewPreference = {
  visibleColumns: DEFAULT_VISIBLE_COLUMNS,
  columnOrder: [],
  filters: null,
  sortColumn: null,
  sortDirection: null,
  pageSize: 50,
}

export function useViewPreference() {
  const [pref, setPref] = useState<ViewPreference>(FALLBACK)
  // ready=false sampai server response. Frontend boleh render tabel pakai
  // FALLBACK selama loading — tidak ada flicker karena DEFAULT match dengan
  // resolveVisibleColumns(empty).
  const [ready, setReady] = useState(false)

  // Load on mount.
  useEffect(() => {
    let cancelled = false
    fetch('/api/orders/view-preference')
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        if (data?.success && data.data?.preference) {
          const p = data.data.preference
          setPref({
            visibleColumns: resolveVisibleColumns(p.visibleColumns),
            columnOrder: p.columnOrder ?? [],
            filters: p.filters ?? null,
            sortColumn: p.sortColumn ?? null,
            sortDirection:
              p.sortDirection === 'asc' || p.sortDirection === 'desc'
                ? p.sortDirection
                : null,
            pageSize: p.pageSize ?? 50,
          })
        }
        setReady(true)
      })
      .catch(() => setReady(true))
    return () => {
      cancelled = true
    }
  }, [])

  // Debounced save — dipanggil setelah setiap update.
  const saveTimer = useRef<NodeJS.Timeout | null>(null)
  const queueSave = useCallback((next: Partial<ViewPreference>) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      fetch('/api/orders/view-preference', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      }).catch(() => {
        // Silent — tidak fatal kalau save gagal sekali. Akan retry di update
        // berikutnya.
      })
    }, 500)
  }, [])

  const update = useCallback(
    (patch: Partial<ViewPreference>) => {
      setPref((prev) => {
        const next = { ...prev, ...patch }
        queueSave(patch)
        return next
      })
    },
    [queueSave],
  )

  return { pref, ready, update }
}
