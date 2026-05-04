'use client'

// CRUD untuk SoulPersonality + SoulStyle. Dua tab — sama persis pola-nya
// karena schema kedua tabel identik. Tabel tampil estimasi token (panjang
// snippet ÷ 4) supaya admin tahu beban prompt-nya.
//
// Hanya admin yang bisa lihat field systemPromptSnippet — komponen ini
// di-render di /admin/soul-settings, sudah dijaga AdminLayout + requireAdmin
// di API.
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { formatNumber } from '@/lib/format'

interface SoulOptionRow {
  id: string
  name: string
  description: string
  systemPromptSnippet: string
  isActive: boolean
  order: number
}

type Kind = 'personality' | 'style'

const ENDPOINTS: Record<Kind, string> = {
  personality: '/api/admin/soul-personalities',
  style: '/api/admin/soul-styles',
}

// 1 token ≈ 4 karakter (rule of thumb Anthropic/OpenAI). Cukup akurat untuk
// estimasi budget prompt — bukan billing.
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

export function SoulSettingsManager() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-warm-900 dark:text-warm-50">
          Soul Settings
        </h1>
        <p className="mt-1 text-sm text-warm-500">
          Kurasi pilihan kepribadian dan gaya balas yang user lihat di SoulBuilder.
          Instruksi AI di bawah adalah <strong>rahasia</strong> — tidak pernah
          ditampilkan ke user biasa.
        </p>
      </div>

      <Tabs defaultValue="personality" className="space-y-4">
        <TabsList>
          <TabsTrigger value="personality">Kepribadian</TabsTrigger>
          <TabsTrigger value="style">Gaya Balas</TabsTrigger>
        </TabsList>
        <TabsContent value="personality">
          <SoulOptionTable kind="personality" labelSingular="Kepribadian" />
        </TabsContent>
        <TabsContent value="style">
          <SoulOptionTable kind="style" labelSingular="Gaya Balas" />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function SoulOptionTable({
  kind,
  labelSingular,
}: {
  kind: Kind
  labelSingular: string
}) {
  const [rows, setRows] = useState<SoulOptionRow[]>([])
  const [isLoading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<SoulOptionRow | null>(null)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [snippet, setSnippet] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [order, setOrder] = useState('0')
  const [isSaving, setSaving] = useState(false)
  const [isDeleting, setDeleting] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch(ENDPOINTS[kind])
      const json = (await res.json()) as { success: boolean; data?: SoulOptionRow[] }
      if (json.success && json.data) setRows(json.data)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    void load()
  }, [kind])

  function openCreate() {
    setEditing(null)
    setName('')
    setDescription('')
    setSnippet('')
    setIsActive(true)
    setOrder(String(rows.length))
    setOpen(true)
  }

  function openEdit(r: SoulOptionRow) {
    setEditing(r)
    setName(r.name)
    setDescription(r.description)
    setSnippet(r.systemPromptSnippet)
    setIsActive(r.isActive)
    setOrder(String(r.order))
    setOpen(true)
  }

  async function save() {
    setSaving(true)
    try {
      const body = {
        name: name.trim(),
        description: description.trim(),
        systemPromptSnippet: snippet.trim(),
        isActive,
        order: Number(order) || 0,
      }
      const url = editing ? `${ENDPOINTS[kind]}/${editing.id}` : ENDPOINTS[kind]
      const res = await fetch(url, {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = (await res.json()) as { success: boolean; error?: string }
      if (!res.ok || !json.success) {
        toast.error(json.error || 'Gagal menyimpan')
        return
      }
      toast.success(editing ? `${labelSingular} diperbarui` : `${labelSingular} dibuat`)
      setOpen(false)
      void load()
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(r: SoulOptionRow) {
    const res = await fetch(`${ENDPOINTS[kind]}/${r.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !r.isActive }),
    })
    const json = (await res.json()) as { success: boolean; error?: string }
    if (!res.ok || !json.success) {
      toast.error(json.error || 'Gagal toggle')
      return
    }
    void load()
  }

  async function remove(r: SoulOptionRow) {
    if (!confirm(`Hapus "${r.name}"? Soul lama yang masih merujuk akan otomatis fallback ke prompt tanpa ${labelSingular.toLowerCase()}.`)) return
    setDeleting(true)
    try {
      const res = await fetch(`${ENDPOINTS[kind]}/${r.id}`, { method: 'DELETE' })
      const json = (await res.json()) as { success: boolean; error?: string }
      if (!res.ok || !json.success) {
        toast.error(json.error || 'Gagal menghapus')
        return
      }
      toast.success(`${labelSingular} dihapus`)
      void load()
    } finally {
      setDeleting(false)
    }
  }

  const liveTokenEstimate = useMemo(() => estimateTokens(snippet), [snippet])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Button
          onClick={openCreate}
          className="bg-primary-500 text-white shadow-orange hover:bg-primary-600"
        >
          <Plus className="mr-2 size-4" /> Tambah {labelSingular}
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nama</TableHead>
              <TableHead>Deskripsi</TableHead>
              <TableHead className="text-right">Estimasi Token</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  <Loader2 className="mx-auto size-4 animate-spin" />
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  Belum ada {labelSingular.toLowerCase()}. Tambahkan supaya muncul di SoulBuilder user.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="max-w-md text-sm text-muted-foreground">
                    <span className="line-clamp-2">{r.description}</span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <Badge variant="outline" className="font-mono">
                      {formatNumber(estimateTokens(r.systemPromptSnippet))} tok
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Switch checked={r.isActive} onCheckedChange={() => toggleActive(r)} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(r)}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => remove(r)}
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
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl px-6">
          <SheetHeader className="px-0">
            <SheetTitle>
              {editing ? `Edit ${labelSingular}` : `Tambah ${labelSingular}`}
            </SheetTitle>
            <SheetDescription>
              Snippet ini akan disuntikkan ke system prompt setiap kali user pilih opsi ini.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-3 py-3">
            <div className="space-y-1.5">
              <Label htmlFor="so-name">Nama</Label>
              <Input
                id="so-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={kind === 'personality' ? 'Misal: Sales Closing' : 'Misal: Closing dengan Pilihan'}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="so-desc">
                Deskripsi <span className="text-xs font-normal text-muted-foreground">(yang tampil ke user)</span>
              </Label>
              <Textarea
                id="so-desc"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Kalimat singkat yang user baca di dropdown SoulBuilder"
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="so-snippet" className="text-red-600">
                  Instruksi AI — Rahasia
                </Label>
                <Badge variant="outline" className="font-mono">
                  ~{formatNumber(liveTokenEstimate)} tok
                </Badge>
              </div>
              <Textarea
                id="so-snippet"
                rows={10}
                value={snippet}
                onChange={(e) => setSnippet(e.target.value)}
                placeholder="Instruksi spesifik yang akan dimasukkan ke section ## Kepribadian / ## Gaya Balas di system prompt."
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                Estimasi dihitung otomatis (panjang ÷ 4). Snippet ini TIDAK pernah dikirim ke client user — hanya muncul di endpoint admin.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="so-order">Urutan</Label>
                <Input
                  id="so-order"
                  type="number"
                  min={0}
                  value={order}
                  onChange={(e) => setOrder(e.target.value)}
                />
              </div>
              <div className="flex items-end justify-between rounded-md border p-3">
                <Label>Aktif</Label>
                <Switch checked={isActive} onCheckedChange={setIsActive} />
              </div>
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
