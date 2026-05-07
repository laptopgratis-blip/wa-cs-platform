'use client'

// Autocomplete destination picker — query ke /api/shipping/destinations dengan
// debounce. Dipakai untuk origin kota di profil shipping & target zona ongkir.
import { Loader2, MapPin, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export interface PickedDestination {
  id: number
  label: string
  province_name: string
  city_name: string
  district_name: string
  subdistrict_name: string
  zip_code: string
}

interface DestinationPickerProps {
  value: PickedDestination | null
  onChange: (val: PickedDestination | null) => void
  placeholder?: string
  disabled?: boolean
  // Override endpoint untuk public form (no-auth). Default pakai endpoint
  // admin (gated). Public form pakai /api/orders/destinations-preview?slug=…
  endpoint?: string
}

export function DestinationPicker({
  value,
  onChange,
  placeholder = 'Cari kota / kecamatan / kelurahan…',
  disabled,
  endpoint,
}: DestinationPickerProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PickedDestination[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputId = useId()

  // Debounce search 300ms.
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([])
      return
    }
    let cancelled = false
    setLoading(true)
    const handle = setTimeout(async () => {
      try {
        const apiUrl = endpoint
          ? `${endpoint}${endpoint.includes('?') ? '&' : '?'}q=${encodeURIComponent(query.trim())}`
          : `/api/shipping/destinations?q=${encodeURIComponent(query.trim())}`
        const res = await fetch(apiUrl)
        const data = await res.json()
        if (cancelled) return
        if (data.success && Array.isArray(data.data?.items)) {
          setResults(data.data.items)
        } else {
          setResults([])
        }
      } catch {
        if (!cancelled) setResults([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [query, endpoint])

  // Click outside → close.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  function pick(d: PickedDestination) {
    onChange(d)
    setQuery('')
    setResults([])
    setOpen(false)
  }

  return (
    <div ref={wrapRef} className="relative">
      {value ? (
        <div className="flex items-start gap-2 rounded-lg border bg-warm-50 px-3 py-2.5">
          <MapPin className="mt-0.5 size-4 shrink-0 text-primary-600" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-warm-900">
              {value.subdistrict_name && value.subdistrict_name !== '-'
                ? `${value.subdistrict_name}, ${value.district_name}`
                : value.district_name}
            </p>
            <p className="text-xs text-warm-600">
              {value.city_name}, {value.province_name} {value.zip_code}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => onChange(null)}
            className="size-7 shrink-0 p-0 text-warm-500 hover:text-destructive"
            aria-label="Hapus pilihan"
          >
            <X className="size-4" />
          </Button>
        </div>
      ) : (
        <>
          <Input
            id={inputId}
            type="search"
            placeholder={placeholder}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            disabled={disabled}
            autoComplete="off"
          />
          {open && (query.trim().length >= 2 || loading) && (
            <div
              className={cn(
                'absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-lg border bg-card shadow-lg',
              )}
            >
              {loading ? (
                <div className="flex items-center gap-2 px-3 py-3 text-sm text-warm-500">
                  <Loader2 className="size-4 animate-spin" />
                  Mencari…
                </div>
              ) : results.length === 0 ? (
                <p className="px-3 py-3 text-sm text-warm-500">
                  Tidak ditemukan. Coba ketik nama kota atau kecamatan.
                </p>
              ) : (
                <ul className="divide-y">
                  {results.map((d) => (
                    <li key={d.id}>
                      <button
                        type="button"
                        onClick={() => pick(d)}
                        className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-primary-50"
                      >
                        <MapPin className="mt-0.5 size-4 shrink-0 text-warm-400" />
                        <div className="min-w-0">
                          <p className="font-medium text-warm-900">
                            {d.subdistrict_name && d.subdistrict_name !== '-'
                              ? `${d.subdistrict_name}, ${d.district_name}`
                              : d.district_name}
                          </p>
                          <p className="text-xs text-warm-500">
                            {d.city_name}, {d.province_name} {d.zip_code}
                          </p>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
