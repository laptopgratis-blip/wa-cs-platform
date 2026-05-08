'use client'

// Inline edit untuk catatan internal admin di tabel /pesanan.
// Save on blur (auto-save). Esc untuk cancel, Enter untuk save (multi-line via shift+enter).
import { Check, Loader2, Pencil, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Textarea } from '@/components/ui/textarea'

interface Props {
  orderId: string
  value: string | null
  onSaved: (next: string | null) => void
}

export function InlineNotesAdmin({ orderId, value, onSaved }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  const [saving, setSaving] = useState(false)

  async function save() {
    const trimmed = draft.trim()
    // No-op kalau identik dengan value awal.
    if (trimmed === (value ?? '')) {
      setEditing(false)
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/orders/${orderId}/notes-admin`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notesAdmin: trimmed || null }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        toast.error(data.error ?? 'Gagal simpan catatan')
        return
      }
      onSaved(data.data.notesAdmin ?? null)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  function cancel() {
    setDraft(value ?? '')
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-1">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          autoFocus
          className="h-auto min-h-[40px] text-xs"
          placeholder="Catatan internal..."
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              cancel()
            }
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              save()
            }
          }}
        />
        <div className="flex gap-1">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded p-1 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
            title="Simpan (Enter)"
          >
            {saving ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Check className="size-3" />
            )}
          </button>
          <button
            type="button"
            onClick={cancel}
            className="rounded p-1 text-warm-500 hover:bg-warm-100"
            title="Batal (Esc)"
          >
            <X className="size-3" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="group block w-full rounded px-1 py-0.5 text-left text-xs hover:bg-warm-100 dark:hover:bg-warm-800"
      title="Klik untuk edit"
    >
      {value ? (
        <span className="line-clamp-2 whitespace-pre-line">{value}</span>
      ) : (
        <span className="inline-flex items-center gap-1 italic text-warm-400 group-hover:text-warm-600">
          <Pencil className="size-3" />
          Tambah catatan
        </span>
      )}
    </button>
  )
}
