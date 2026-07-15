'use client'

// Autocomplete PROVINSI — sumber /api/shipping/provinces (master lokal,
// ±38 provinsi, di-fetch sekali lalu difilter client-side). Beda dengan
// DestinationPicker yang mencari kota/kecamatan via Komerce.
// Dipakai form zona ongkir: pilih provinsi include & provinsi exclude.
import { Loader2, Map } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'

import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface ProvincePickerProps {
  // Dipanggil saat user memilih satu provinsi dari daftar. Input dikosongkan
  // lagi setelah pilih supaya bisa langsung menambah provinsi berikutnya.
  onPick: (provinceName: string) => void
  placeholder?: string
  disabled?: boolean
}

export function ProvincePicker({
  onPick,
  placeholder = 'Cari provinsi… (mis. Papua)',
  disabled,
}: ProvincePickerProps) {
  const [query, setQuery] = useState('')
  const [all, setAll] = useState<string[] | null>(null)
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputId = useId()
  const loading = all === null

  // Fetch semua provinsi SEKALI saat mount — datanya cuma ±38 baris, murah,
  // lalu difilter client-side per ketikan.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/shipping/provinces')
        const json = (await res.json()) as {
          success: boolean
          data?: { items: string[] }
        }
        if (!cancelled) setAll(json.success && json.data ? json.data.items : [])
      } catch {
        if (!cancelled) setAll([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Tutup dropdown saat klik di luar.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const results = (all ?? []).filter((p) =>
    p.toLowerCase().includes(query.trim().toLowerCase()),
  )

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <Map className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-warm-400" />
        <Input
          id={inputId}
          value={query}
          disabled={disabled}
          placeholder={placeholder}
          className="pl-9"
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          autoComplete="off"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-warm-400" />
        )}
      </div>

      {open && all !== null && (
        <div className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-md border bg-popover py-1 shadow-md">
          {results.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">
              Provinsi tidak ditemukan.
            </p>
          ) : (
            results.map((p) => (
              <button
                key={p}
                type="button"
                className={cn(
                  'block w-full px-3 py-2 text-left text-sm hover:bg-accent',
                )}
                onClick={() => {
                  onPick(p)
                  setQuery('')
                  setOpen(false)
                }}
              >
                {p}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
