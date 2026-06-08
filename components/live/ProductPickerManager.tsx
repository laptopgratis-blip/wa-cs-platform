'use client'

// Picker produk per Live Room: multi-select + urut (▲▼ / drag desktop) +
// set "unggulan" (⭐). Dipakai di LiveRoomForm. State diangkat ke parent.
import {
  ChevronDown,
  ChevronUp,
  GripVertical,
  Loader2,
  Plus,
  Search,
  Star,
  X,
} from 'lucide-react'
import { useMemo, useState } from 'react'

import { Label } from '@/components/ui/label'

export interface ProductOption {
  id: string
  name: string
  price: number
  imageUrl: string | null
}

export function ProductPickerManager({
  products,
  selected,
  featuredId,
  onChangeSelected,
  onChangeFeatured,
}: {
  products: ProductOption[] | null
  selected: string[]
  featuredId: string | null
  onChangeSelected: (ids: string[]) => void
  onChangeFeatured: (id: string | null) => void
}) {
  const [query, setQuery] = useState('')
  const [dragIdx, setDragIdx] = useState<number | null>(null)

  const byId = useMemo(() => {
    const m = new Map<string, ProductOption>()
    for (const p of products ?? []) m.set(p.id, p)
    return m
  }, [products])

  // Produk terpilih dalam urutan `selected`.
  const selectedProducts = selected
    .map((id) => byId.get(id))
    .filter((p): p is ProductOption => Boolean(p))

  // Produk tersedia (belum dipilih) + filter pencarian.
  const available = (products ?? [])
    .filter((p) => !selected.includes(p.id))
    .filter((p) =>
      query.trim()
        ? p.name.toLowerCase().includes(query.trim().toLowerCase())
        : true,
    )

  function add(id: string) {
    onChangeSelected([...selected, id])
  }
  function remove(id: string) {
    onChangeSelected(selected.filter((x) => x !== id))
    if (featuredId === id) onChangeFeatured(null)
  }
  function move(index: number, dir: -1 | 1) {
    const next = [...selected]
    const target = index + dir
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    onChangeSelected(next)
  }
  function reorderTo(from: number, to: number) {
    if (from === to) return
    const next = [...selected]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    onChangeSelected(next)
  }
  function toggleFeatured(id: string) {
    onChangeFeatured(featuredId === id ? null : id)
  }

  if (products === null) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading produk…
      </div>
    )
  }
  if (products.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Belum ada produk. Tambah di <span className="font-medium">/products</span>{' '}
        dulu.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label>Produk di Room (urutan = urutan tampil)</Label>
        <span className="text-xs text-muted-foreground">
          {selected.length} dipilih
        </span>
      </div>

      {/* TERPILIH — ordered, reorder, featured, remove */}
      {selectedProducts.length > 0 ? (
        <ul className="space-y-2" aria-label="Produk terpilih (bisa diurutkan)">
          {selectedProducts.map((p, i) => {
            const isFeatured = featuredId === p.id || (!featuredId && i === 0)
            return (
              <li
                key={p.id}
                draggable
                onDragStart={() => setDragIdx(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragIdx !== null) reorderTo(dragIdx, i)
                  setDragIdx(null)
                }}
                onDragEnd={() => setDragIdx(null)}
                className={`flex items-center gap-2 rounded-lg border bg-white p-2 transition ${
                  dragIdx === i ? 'opacity-50' : ''
                } ${isFeatured ? 'border-orange-300 ring-1 ring-orange-200' : 'border-warm-200'}`}
              >
                <span
                  className="hidden cursor-grab text-warm-400 sm:block"
                  aria-hidden="true"
                  title="Seret untuk urutkan"
                >
                  <GripVertical className="h-4 w-4" />
                </span>

                {/* Featured toggle */}
                <button
                  type="button"
                  onClick={() => toggleFeatured(p.id)}
                  aria-pressed={featuredId === p.id}
                  aria-label={
                    featuredId === p.id
                      ? `Batalkan unggulan ${p.name}`
                      : `Jadikan unggulan ${p.name}`
                  }
                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md hover:bg-warm-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
                >
                  <Star
                    className={`h-4 w-4 ${
                      featuredId === p.id
                        ? 'fill-amber-400 text-amber-400'
                        : 'text-warm-400'
                    }`}
                  />
                </button>

                {p.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.imageUrl}
                    alt=""
                    className="h-10 w-10 flex-shrink-0 rounded object-cover"
                  />
                ) : (
                  <div className="h-10 w-10 flex-shrink-0 rounded bg-warm-100" />
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium">{p.name}</span>
                    {isFeatured ? (
                      <span className="flex-shrink-0 rounded-sm bg-orange-100 px-1 py-px text-[9px] font-bold uppercase tracking-wide text-orange-700">
                        Unggulan
                      </span>
                    ) : null}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Rp {p.price.toLocaleString('id-ID')}
                  </div>
                </div>

                {/* Reorder ▲▼ */}
                <div className="flex flex-shrink-0 flex-col">
                  <button
                    type="button"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    aria-label={`Naikkan ${p.name}`}
                    className="flex h-5 w-7 items-center justify-center rounded text-warm-500 hover:bg-warm-100 disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={i === selectedProducts.length - 1}
                    aria-label={`Turunkan ${p.name}`}
                    className="flex h-5 w-7 items-center justify-center rounded text-warm-500 hover:bg-warm-100 disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => remove(p.id)}
                  aria-label={`Hapus ${p.name} dari room`}
                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-warm-400 hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed border-warm-200 px-3 py-4 text-center text-sm text-muted-foreground">
          Belum ada produk dipilih. Tambah dari daftar di bawah.
        </p>
      )}

      {/* TERSEDIA — search + add */}
      <div className="rounded-lg border border-warm-200 p-3">
        <div className="relative mb-2">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-warm-400"
            aria-hidden="true"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari produk untuk ditambahkan…"
            aria-label="Cari produk"
            className="w-full rounded-md border border-warm-200 bg-warm-50 py-2 pl-8 pr-3 text-sm focus:border-orange-500 focus:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/40"
          />
        </div>
        {available.length === 0 ? (
          <p className="py-3 text-center text-sm text-muted-foreground">
            {query.trim() ? 'Tidak ada produk cocok.' : 'Semua produk sudah dipilih.'}
          </p>
        ) : (
          <ul
            className="grid max-h-56 grid-cols-1 gap-1.5 overflow-y-auto sm:grid-cols-2"
            aria-label="Produk tersedia"
          >
            {available.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => add(p.id)}
                  className="flex w-full items-center gap-2 rounded-md border border-transparent p-1.5 text-left hover:border-warm-200 hover:bg-warm-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
                >
                  <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-orange-100 text-orange-600">
                    <Plus className="h-4 w-4" />
                  </span>
                  {p.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.imageUrl}
                      alt=""
                      className="h-8 w-8 flex-shrink-0 rounded object-cover"
                    />
                  ) : (
                    <div className="h-8 w-8 flex-shrink-0 rounded bg-warm-100" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{p.name}</div>
                    <div className="text-xs text-muted-foreground">
                      Rp {p.price.toLocaleString('id-ID')}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
