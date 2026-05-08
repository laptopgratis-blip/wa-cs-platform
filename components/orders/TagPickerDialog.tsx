'use client'

// Dialog mini untuk pilih + assign tags ke 1 order. Bisa buat tag baru
// langsung dari sini (tanpa pindah halaman). Save = replace seluruh tag set
// untuk order itu (PUT /api/orders/[id]/tags).
import { Loader2, Plus, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

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

import type { OrderTagBadge } from './types'

interface TagOption {
  id: string
  name: string
  color: string
  orderCount?: number
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  orderId: string | null
  initialTags: OrderTagBadge[]
  onSaved: (tags: OrderTagBadge[]) => void
}

// Preset warna untuk tag baru. User bisa cycle dengan klik swatch.
const PRESET_COLORS = [
  '#EF4444', // red
  '#F97316', // orange
  '#EAB308', // yellow
  '#22C55E', // green
  '#3B82F6', // blue
  '#8B5CF6', // purple
  '#EC4899', // pink
  '#6B7280', // gray
]

export function TagPickerDialog({
  open,
  onOpenChange,
  orderId,
  initialTags,
  onSaved,
}: Props) {
  const [allTags, setAllTags] = useState<TagOption[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(initialTags.map((t) => t.id)),
  )
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  // Form buat tag baru.
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(PRESET_COLORS[0])
  const [creating, setCreating] = useState(false)

  // Refresh list saat dialog dibuka.
  useEffect(() => {
    if (!open) return
    setSelectedIds(new Set(initialTags.map((t) => t.id)))
    setLoading(true)
    fetch('/api/order-tags')
      .then((r) => r.json())
      .then((data) => {
        if (data?.success) setAllTags(data.data.items ?? [])
      })
      .catch(() => toast.error('Gagal memuat daftar tag'))
      .finally(() => setLoading(false))
  }, [open, initialTags])

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleCreate() {
    const name = newName.trim()
    if (!name) {
      toast.error('Nama tag wajib diisi')
      return
    }
    setCreating(true)
    try {
      const res = await fetch('/api/order-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color: newColor }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        toast.error(data.error ?? 'Gagal buat tag')
        return
      }
      const created: TagOption = data.data
      setAllTags((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))
      setSelectedIds((prev) => new Set(prev).add(created.id))
      setNewName('')
      setNewColor(PRESET_COLORS[0])
      toast.success('Tag dibuat')
    } finally {
      setCreating(false)
    }
  }

  async function handleSave() {
    if (!orderId) return
    setSaving(true)
    try {
      const res = await fetch(`/api/orders/${orderId}/tags`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tagIds: Array.from(selectedIds) }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        toast.error(data.error ?? 'Gagal simpan tag')
        return
      }
      onSaved(data.data.tags)
      onOpenChange(false)
      toast.success('Tag tersimpan')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Atur Tag Pesanan</DialogTitle>
        </DialogHeader>

        {/* Existing tags list */}
        <div className="max-h-60 space-y-1 overflow-y-auto rounded-md border p-2">
          {loading ? (
            <div className="flex items-center justify-center py-6 text-warm-500">
              <Loader2 className="size-4 animate-spin" />
            </div>
          ) : allTags.length === 0 ? (
            <p className="px-2 py-3 text-center text-xs text-warm-500">
              Belum ada tag. Buat di bawah.
            </p>
          ) : (
            allTags.map((tag) => (
              <label
                key={tag.id}
                className="flex cursor-pointer items-center gap-2 rounded p-1.5 hover:bg-warm-50 dark:hover:bg-warm-900/40"
              >
                <Checkbox
                  checked={selectedIds.has(tag.id)}
                  onCheckedChange={() => toggle(tag.id)}
                />
                <span
                  className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
                  style={{ backgroundColor: tag.color }}
                >
                  {tag.name}
                </span>
                {typeof tag.orderCount === 'number' && (
                  <span className="ml-auto text-[10px] text-warm-500">
                    {tag.orderCount}× dipakai
                  </span>
                )}
              </label>
            ))
          )}
        </div>

        {/* Create new tag */}
        <div className="rounded-md border bg-warm-50 p-3 dark:bg-warm-900/40">
          <p className="mb-2 text-xs font-semibold text-warm-600">
            + Buat tag baru
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Nama tag (mis. VIP)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={40}
              className="h-9 flex-1 min-w-[150px]"
            />
            <div className="flex gap-1">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Pilih warna ${c}`}
                  onClick={() => setNewColor(c)}
                  className={`size-6 rounded-full border-2 ${
                    newColor === c ? 'border-warm-900 dark:border-white' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={creating || !newName.trim()}
            >
              {creating ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Plus className="size-3" />
              )}
            </Button>
          </div>
        </div>

        <DialogFooter className="flex flex-row items-center justify-between sm:justify-between">
          <span className="text-xs text-warm-500">
            {selectedIds.size} tag dipilih
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              <X className="mr-1 size-3" /> Batal
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-1 size-3 animate-spin" />}
              Simpan
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
