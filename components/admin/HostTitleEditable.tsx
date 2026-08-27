'use client'

// Judul host dengan edit inline — rename host tanpa pindah halaman.
// Dipakai di ClipLibraryBoard (Klip Live) dan HostSceneBoard (TTS host).
// PATCH /api/host-templates/[id] (owner atau admin).
import { Check, Loader2, Pencil, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TONES } from '@/lib/ui-tones'
import { cn } from '@/lib/utils'

interface HostTitleEditableProps {
  hostId: string
  name: string
  // Prefix statis sebelum nama, mis. "🎙️ Klip Live — ".
  prefix?: string
  className?: string
  // Callback ke parent (mis. sync state host di HostSceneBoard).
  onRenamed?: (name: string) => void
}

export function HostTitleEditable({
  hostId,
  name,
  prefix = '',
  className,
  onRenamed,
}: HostTitleEditableProps) {
  const router = useRouter()
  const [displayName, setDisplayName] = useState(name)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  const [saving, setSaving] = useState(false)

  // Reconcile saat prop berubah (router.refresh() bawa nama baru dari server).
  // Pola "adjust state during render" — bukan useEffect — supaya tidak ada
  // render ganda kaskade.
  const [prevName, setPrevName] = useState(name)
  if (name !== prevName) {
    setPrevName(name)
    setDisplayName(name)
  }

  const startEdit = () => {
    setDraft(displayName)
    setEditing(true)
  }

  const cancelEdit = () => {
    setDraft(displayName)
    setEditing(false)
  }

  const save = async () => {
    const trimmed = draft.trim()
    if (trimmed.length < 2) {
      toast.error('Nama minimal 2 karakter')
      return
    }
    if (trimmed === displayName) {
      setEditing(false)
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/host-templates/${hostId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      })
      const json = (await res.json()) as {
        success: boolean
        data?: { name: string }
        error?: string
      }
      if (!json.success || !json.data) {
        throw new Error(json.error ?? 'Gagal menyimpan nama host')
      }
      setDisplayName(json.data.name)
      setEditing(false)
      onRenamed?.(json.data.name)
      toast.success('Nama host disimpan')
      router.refresh()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {prefix ? <span className={className}>{prefix}</span> : null}
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void save()
            if (e.key === 'Escape') cancelEdit()
          }}
          maxLength={120}
          autoFocus
          disabled={saving}
          className="h-9 w-56 max-w-full font-semibold"
          placeholder="Nama host"
        />
        <Button
          size="icon"
          variant="ghost"
          className="size-8"
          onClick={() => void save()}
          disabled={saving}
          title="Simpan nama"
        >
          {saving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Check className={cn('size-4', TONES.success.text)} />
          )}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-8"
          onClick={cancelEdit}
          disabled={saving}
          title="Batal"
        >
          <X className="size-4" />
        </Button>
      </div>
    )
  }

  return (
    <span className="group inline-flex items-center gap-1.5">
      <span className={className}>
        {prefix}
        {displayName}
      </span>
      <Button
        size="icon"
        variant="ghost"
        className="text-warm-400 hover:text-warm-700 size-7"
        onClick={startEdit}
        title="Edit nama host"
      >
        <Pencil className="size-3.5" />
      </Button>
    </span>
  )
}
