'use client'

// CRUD AI Models — list + sheet form (create/edit) + toggle aktif + delete.
import type { AiProvider } from '@prisma/client'
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { formatNumber } from '@/lib/format'

interface AiModelRow {
  id: string
  name: string
  provider: AiProvider
  modelId: string
  costPerMessage: number
  description: string | null
  isActive: boolean
  _count: { waSessions: number }
}

const PROVIDERS: AiProvider[] = ['ANTHROPIC', 'OPENAI', 'GOOGLE']

export function ModelsManager() {
  const [models, setModels] = useState<AiModelRow[]>([])
  const [isLoading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<AiModelRow | null>(null)

  // Form fields
  const [name, setName] = useState('')
  const [provider, setProvider] = useState<AiProvider>('ANTHROPIC')
  const [modelId, setModelId] = useState('')
  const [cost, setCost] = useState('1')
  const [description, setDescription] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [isSaving, setSaving] = useState(false)
  const [isDeleting, setDeleting] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/models')
      const json = (await res.json()) as { success: boolean; data?: AiModelRow[] }
      if (json.success && json.data) setModels(json.data)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    void load()
  }, [])

  function openCreate() {
    setEditing(null)
    setName('')
    setProvider('ANTHROPIC')
    setModelId('')
    setCost('1')
    setDescription('')
    setIsActive(true)
    setOpen(true)
  }

  function openEdit(m: AiModelRow) {
    setEditing(m)
    setName(m.name)
    setProvider(m.provider)
    setModelId(m.modelId)
    setCost(String(m.costPerMessage))
    setDescription(m.description ?? '')
    setIsActive(m.isActive)
    setOpen(true)
  }

  async function save() {
    setSaving(true)
    try {
      const body = {
        name: name.trim(),
        provider,
        modelId: modelId.trim(),
        costPerMessage: Number(cost),
        description: description.trim() === '' ? null : description.trim(),
        isActive,
      }
      const res = await fetch(
        editing ? `/api/admin/models/${editing.id}` : '/api/admin/models',
        {
          method: editing ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      )
      const json = (await res.json()) as { success: boolean; error?: string }
      if (!res.ok || !json.success) {
        toast.error(json.error || 'Gagal menyimpan')
        return
      }
      toast.success(editing ? 'Model diperbarui' : 'Model dibuat')
      setOpen(false)
      void load()
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(m: AiModelRow) {
    const res = await fetch(`/api/admin/models/${m.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !m.isActive }),
    })
    const json = (await res.json()) as { success: boolean; error?: string }
    if (!res.ok || !json.success) {
      toast.error(json.error || 'Gagal toggle')
      return
    }
    void load()
  }

  async function remove(m: AiModelRow) {
    if (!confirm(`Hapus model "${m.name}"?`)) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/models/${m.id}`, { method: 'DELETE' })
      const json = (await res.json()) as { success: boolean; error?: string }
      if (!res.ok || !json.success) {
        toast.error(json.error || 'Gagal menghapus')
        return
      }
      toast.success('Model dihapus')
      void load()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-warm-900 dark:text-warm-50">
            AI Models
          </h1>
          <p className="mt-1 text-sm text-warm-500">
            Atur model AI yang tersedia untuk user dan biaya token per pesan.
          </p>
        </div>
        <Button
          onClick={openCreate}
          className="bg-primary-500 text-white shadow-orange hover:bg-primary-600"
        >
          <Plus className="mr-2 size-4" /> Tambah Model
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nama</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Model ID</TableHead>
              <TableHead className="text-right">Cost/pesan</TableHead>
              <TableHead className="text-right">Dipakai</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  <Loader2 className="mx-auto size-4 animate-spin" />
                </TableCell>
              </TableRow>
            ) : models.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  Belum ada model.
                </TableCell>
              </TableRow>
            ) : (
              models.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-normal">
                      {m.provider}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{m.modelId}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(m.costPerMessage)}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {m._count.waSessions}
                  </TableCell>
                  <TableCell>
                    <Switch checked={m.isActive} onCheckedChange={() => toggleActive(m)} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(m)}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => remove(m)}
                      disabled={isDeleting}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md px-6">
          <SheetHeader className="px-0">
            <SheetTitle>{editing ? 'Edit Model' : 'Tambah Model'}</SheetTitle>
            <SheetDescription>
              Konfigurasi model AI yang bisa user pilih untuk WA session.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-3 py-3">
            <div className="space-y-1.5">
              <Label htmlFor="m-name">Nama</Label>
              <Input
                id="m-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Misal: Claude Haiku (Cepat)"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Provider</Label>
              <Select value={provider} onValueChange={(v) => setProvider(v as AiProvider)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDERS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m-id">Model ID</Label>
              <Input
                id="m-id"
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                placeholder="claude-haiku-4-5-20251001"
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m-cost">Token per pesan</Label>
              <Input
                id="m-cost"
                type="number"
                min={1}
                value={cost}
                onChange={(e) => setCost(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m-desc">Deskripsi</Label>
              <Textarea
                id="m-desc"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <Label>Aktif</Label>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t pt-3">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button onClick={save} disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 size-4 animate-spin" />}
              Simpan
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
