'use client'

// LmsPackagesManager — CRUD plan LMS. Mirror LpPackagesManager UI.
import { GraduationCap, Loader2, Pencil, Plus, Sparkles } from 'lucide-react'
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
import { formatRupiah } from '@/lib/format'

interface LmsPkg {
  id: string
  name: string
  description: string | null
  tier: 'FREE' | 'BASIC' | 'PRO' | 'UNLIMITED'
  maxCourses: number
  maxLessonsPerCourse: number
  maxStudentsPerCourse: number
  maxFileStorageMB: number
  canUseDripSchedule: boolean
  canIssueCertificate: boolean
  priceMonthly: number
  isPopular: boolean
  isActive: boolean
  sortOrder: number
}

const EMPTY_FORM = {
  name: '',
  description: '',
  tier: 'BASIC' as LmsPkg['tier'],
  maxCourses: 5,
  maxLessonsPerCourse: 20,
  maxStudentsPerCourse: 500,
  maxFileStorageMB: 200,
  canUseDripSchedule: false,
  canIssueCertificate: false,
  priceMonthly: 0,
  isPopular: false,
  isActive: true,
  sortOrder: 1,
}

function fmtLimit(v: number): string {
  return v < 0 ? '∞' : v.toLocaleString('id-ID')
}

export function LmsPackagesManager() {
  const [packages, setPackages] = useState<LmsPkg[]>([])
  const [loading, setLoading] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [editing, setEditing] = useState<LmsPkg | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [form, setForm] = useState({ ...EMPTY_FORM })

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/lms-packages')
      const json = await res.json()
      if (!res.ok || !json.success) {
        toast.error(json.message || 'Gagal load')
        return
      }
      setPackages(json.data.packages)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  function openCreate() {
    setEditing(null)
    setForm({ ...EMPTY_FORM })
    setSheetOpen(true)
  }

  function openEdit(p: LmsPkg) {
    setEditing(p)
    setForm({
      name: p.name,
      description: p.description ?? '',
      tier: p.tier,
      maxCourses: p.maxCourses,
      maxLessonsPerCourse: p.maxLessonsPerCourse,
      maxStudentsPerCourse: p.maxStudentsPerCourse,
      maxFileStorageMB: p.maxFileStorageMB,
      canUseDripSchedule: p.canUseDripSchedule,
      canIssueCertificate: p.canIssueCertificate,
      priceMonthly: p.priceMonthly,
      isPopular: p.isPopular,
      isActive: p.isActive,
      sortOrder: p.sortOrder,
    })
    setSheetOpen(true)
  }

  async function save() {
    const url = editing
      ? `/api/admin/lms-packages/${editing.id}`
      : '/api/admin/lms-packages'
    const method = editing ? 'PATCH' : 'POST'
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        description: form.description.trim() || null,
      }),
    })
    const json = await res.json()
    if (!res.ok || !json.success) {
      toast.error(json.message || 'Gagal save')
      return
    }
    toast.success(editing ? 'Plan di-update' : 'Plan dibuat')
    setSheetOpen(false)
    load()
  }

  async function seedDefaults() {
    if (
      !confirm(
        'Seed 4 tier default (FREE/BASIC/PRO/UNLIMITED)? Idempotent — yang sudah ada di-skip.',
      )
    )
      return
    setSeeding(true)
    try {
      const res = await fetch('/api/admin/lms-packages/seed', {
        method: 'POST',
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        toast.error(json.message || 'Gagal seed')
        return
      }
      const c = json.data.created.length
      const s = json.data.skipped.length
      toast.success(`Seed: ${c} dibuat, ${s} di-skip (sudah ada)`)
      load()
    } finally {
      setSeeding(false)
    }
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <GraduationCap className="size-5 text-primary-500" />
            <h1 className="font-display text-2xl font-extrabold tracking-tight">
              Paket LMS
            </h1>
          </div>
          <p className="text-sm text-warm-500">
            Plan upgrade untuk LMS — student per course, jumlah course, file
            storage. User bayar pakai saldo token. Muncul di /pricing-lms.
          </p>
        </div>
        <div className="flex gap-2">
          {packages.length === 0 && (
            <Button
              onClick={seedDefaults}
              disabled={seeding}
              variant="outline"
            >
              {seeding ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 size-4" />
              )}
              Seed Default Tier
            </Button>
          )}
          <Button
            onClick={openCreate}
            className="bg-primary-500 text-white hover:bg-primary-600"
          >
            <Plus className="mr-2 size-4" />
            Tambah Plan
          </Button>
        </div>
      </header>

      <div className="rounded-xl border border-warm-200 bg-card">
        {loading ? (
          <div className="py-16 text-center text-sm text-warm-500">
            Loading...
          </div>
        ) : packages.length === 0 ? (
          <div className="py-16 text-center text-sm text-warm-500">
            Belum ada plan. Klik <strong>Seed Default Tier</strong> untuk
            generate FREE/BASIC/PRO/UNLIMITED.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Plan</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead className="text-right">Course</TableHead>
                <TableHead className="text-right">Lesson/course</TableHead>
                <TableHead className="text-right">Student</TableHead>
                <TableHead className="text-right">Harga/bln</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {packages.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="font-semibold">{p.name}</div>
                    {p.isPopular && (
                      <Badge className="mt-0.5 bg-amber-100 text-[10px] text-amber-700">
                        Populer
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{p.tier}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtLimit(p.maxCourses)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtLimit(p.maxLessonsPerCourse)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtLimit(p.maxStudentsPerCourse)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {p.priceMonthly === 0 ? '—' : formatRupiah(p.priceMonthly)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={
                        p.isActive
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-warm-100 text-warm-600'
                      }
                    >
                      {p.isActive ? 'Aktif' : 'Nonaktif'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEdit(p)}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full max-w-md overflow-y-auto sm:max-w-md">
          <SheetHeader className="px-0">
            <SheetTitle>
              {editing ? 'Edit Plan LMS' : 'Tambah Plan LMS'}
            </SheetTitle>
            <SheetDescription>
              Plan ini muncul di /pricing-lms. Isi -1 untuk unlimited.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-3 py-3">
            <div className="space-y-1.5">
              <Label htmlFor="name">Nama</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Tier</Label>
              <Select
                value={form.tier}
                onValueChange={(v) =>
                  setForm({ ...form, tier: v as LmsPkg['tier'] })
                }
                disabled={Boolean(editing)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FREE">FREE</SelectItem>
                  <SelectItem value="BASIC">BASIC</SelectItem>
                  <SelectItem value="PRO">PRO</SelectItem>
                  <SelectItem value="UNLIMITED">UNLIMITED</SelectItem>
                </SelectContent>
              </Select>
              {editing && (
                <p className="text-[11px] text-warm-500">
                  Tier tidak bisa diubah karena terkait quota user existing.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="desc">Deskripsi</Label>
              <Textarea
                id="desc"
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Max Course</Label>
                <Input
                  type="number"
                  value={form.maxCourses}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      maxCourses: Number(e.target.value),
                    })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Max Lesson/course</Label>
                <Input
                  type="number"
                  value={form.maxLessonsPerCourse}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      maxLessonsPerCourse: Number(e.target.value),
                    })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Max Student/course</Label>
                <Input
                  type="number"
                  value={form.maxStudentsPerCourse}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      maxStudentsPerCourse: Number(e.target.value),
                    })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>File Storage (MB)</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.maxFileStorageMB}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      maxFileStorageMB: Number(e.target.value),
                    })
                  }
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                checked={form.canUseDripSchedule}
                onCheckedChange={(v) =>
                  setForm({ ...form, canUseDripSchedule: v })
                }
              />
              <Label>Drip Schedule (Phase 4)</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={form.canIssueCertificate}
                onCheckedChange={(v) =>
                  setForm({ ...form, canIssueCertificate: v })
                }
              />
              <Label>Sertifikat Completion (Phase 4)</Label>
            </div>

            <div className="space-y-1.5">
              <Label>Harga/bulan (Rp)</Label>
              <Input
                type="number"
                min={0}
                value={form.priceMonthly}
                onChange={(e) =>
                  setForm({ ...form, priceMonthly: Number(e.target.value) })
                }
              />
              <p className="text-[11px] text-warm-500">
                0 = belum bisa di-checkout. Set &gt; 0 supaya muncul di
                /pricing-lms.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Sort Order</Label>
                <Input
                  type="number"
                  value={form.sortOrder}
                  onChange={(e) =>
                    setForm({ ...form, sortOrder: Number(e.target.value) })
                  }
                />
              </div>
              <div className="flex items-end gap-3">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={form.isPopular}
                    onCheckedChange={(v) =>
                      setForm({ ...form, isPopular: v })
                    }
                  />
                  <Label>Populer</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={form.isActive}
                    onCheckedChange={(v) =>
                      setForm({ ...form, isActive: v })
                    }
                  />
                  <Label>Aktif</Label>
                </div>
              </div>
            </div>

            <Button
              onClick={save}
              className="w-full bg-primary-500 text-white hover:bg-primary-600"
            >
              Simpan
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
