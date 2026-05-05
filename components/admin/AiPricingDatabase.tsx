'use client'

// /admin/ai-pricing — Pricing Database UI.
// Section A: header + tombol "Update via AI"
// Section B: modal review changes setelah research selesai
// Section C: tabel preset dengan filter & status freshness
// Section D: log research terakhir
import { formatDistanceToNow } from 'date-fns'
import { id as idLocale } from 'date-fns/locale'
import {
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  Pencil,
  RefreshCw,
  Sparkles,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

type Provider = 'ANTHROPIC' | 'OPENAI' | 'GOOGLE'
type Freshness = 'verified' | 'stale' | 'outdated'

interface Preset {
  id: string
  provider: Provider
  modelId: string
  displayName: string
  inputPricePer1M: number
  outputPricePer1M: number
  contextWindow: number | null
  isAvailable: boolean
  notes: string | null
  lastUpdatedSource: string | null
  lastUpdatedAt: string
  daysSinceUpdate: number
  freshnessStatus: Freshness
}

interface DiffEntry {
  modelId: string
  action: 'add' | 'update' | 'unchanged'
  before?: { inputPricePer1M: number; outputPricePer1M: number }
  after: {
    provider: Provider
    modelId: string
    displayName: string
    inputPricePer1M: number
    outputPricePer1M: number
  }
}

interface JobStatus {
  id: string
  status: 'RUNNING' | 'SUCCESS' | 'FAILED'
  modelsAdded: number
  modelsUpdated: number
  diff: { added: DiffEntry[]; updated: DiffEntry[]; unchanged: DiffEntry[] } | null
  error: string | null
  startedAt: string
  completedAt: string | null
}

interface LogEntry {
  id: string
  triggeredBy: string
  status: string
  modelsAdded: number
  modelsUpdated: number
  error: string | null
  startedAt: string
  completedAt: string | null
}

const FRESHNESS_LABEL: Record<Freshness, string> = {
  verified: '🟢 Verified',
  stale: '🟡 Stale',
  outdated: '🔴 Outdated',
}

const FRESHNESS_STYLE: Record<Freshness, string> = {
  verified: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100',
  stale: 'bg-amber-100 text-amber-800 hover:bg-amber-100',
  outdated: 'bg-red-100 text-red-700 hover:bg-red-100',
}

const RESEARCH_STEPS = [
  '🔍 Mencari harga di Anthropic...',
  '🔍 Mencari harga di OpenAI...',
  '🔍 Mencari harga di Google...',
  '📊 Validasi & diff dengan database...',
]

function formatPrice(v: number): string {
  return `$${v.toFixed(2)}`
}

export function AiPricingDatabase() {
  const [presets, setPresets] = useState<Preset[]>([])
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [filterProvider, setFilterProvider] = useState<'ALL' | Provider>('ALL')
  const [filterFreshness, setFilterFreshness] = useState<'ALL' | Freshness>(
    'ALL',
  )

  // Research workflow
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [job, setJob] = useState<JobStatus | null>(null)
  const [stepIdx, setStepIdx] = useState(0)
  const [reviewSelected, setReviewSelected] = useState<Set<string>>(new Set())
  const [applying, setApplying] = useState(false)
  const [logsOpen, setLogsOpen] = useState(false)

  // Edit modal
  const [editing, setEditing] = useState<Preset | null>(null)
  const [editInput, setEditInput] = useState('')
  const [editOutput, setEditOutput] = useState('')
  const [editName, setEditName] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  const loadPresets = useCallback(async () => {
    const res = await fetch('/api/admin/ai-pricing/presets')
    const json = (await res.json()) as { success: boolean; data?: Preset[] }
    if (json.success && json.data) setPresets(json.data)
  }, [])

  const loadLogs = useCallback(async () => {
    const res = await fetch('/api/admin/ai-pricing/logs')
    const json = (await res.json()) as { success: boolean; data?: LogEntry[] }
    if (json.success && json.data) setLogs(json.data)
  }, [])

  useEffect(() => {
    void loadPresets()
    void loadLogs()
  }, [loadPresets, loadLogs])

  // Last updated terbaru → header info.
  const lastUpdated = useMemo(() => {
    if (presets.length === 0) return null
    const sorted = [...presets].sort(
      (a, b) =>
        new Date(b.lastUpdatedAt).getTime() -
        new Date(a.lastUpdatedAt).getTime(),
    )
    return sorted[0]?.lastUpdatedAt ?? null
  }, [presets])

  const filtered = useMemo(() => {
    return presets.filter((p) => {
      if (filterProvider !== 'ALL' && p.provider !== filterProvider) return false
      if (filterFreshness !== 'ALL' && p.freshnessStatus !== filterFreshness)
        return false
      return true
    })
  }, [presets, filterProvider, filterFreshness])

  // ── Research flow ──────────────────────────────────────────────────
  async function startResearch() {
    setConfirmOpen(false)
    setJob({ id: '', status: 'RUNNING', modelsAdded: 0, modelsUpdated: 0, diff: null, error: null, startedAt: new Date().toISOString(), completedAt: null })
    setStepIdx(0)
    try {
      const res = await fetch('/api/admin/ai-pricing/research', {
        method: 'POST',
      })
      const json = (await res.json()) as {
        success: boolean
        data?: { jobId: string }
        error?: string
      }
      if (!res.ok || !json.success || !json.data) {
        toast.error(json.error || 'Gagal mulai research')
        setJob(null)
        return
      }
      pollJob(json.data.jobId)
    } catch {
      toast.error('Gagal mulai research')
      setJob(null)
    }
  }

  function pollJob(jobId: string) {
    let stepTimer = setInterval(() => {
      setStepIdx((i) => Math.min(i + 1, RESEARCH_STEPS.length - 1))
    }, 8000)

    const tick = async () => {
      try {
        const res = await fetch(`/api/admin/ai-pricing/research/${jobId}`)
        const json = (await res.json()) as { success: boolean; data?: JobStatus }
        if (json.success && json.data) {
          setJob(json.data)
          if (json.data.status !== 'RUNNING') {
            clearInterval(stepTimer)
            clearInterval(timer)
            if (json.data.status === 'SUCCESS') {
              setStepIdx(RESEARCH_STEPS.length)
              const all = [
                ...(json.data.diff?.added ?? []),
                ...(json.data.diff?.updated ?? []),
              ]
              setReviewSelected(new Set(all.map((d) => d.modelId)))
              void loadLogs()
            } else {
              toast.error(json.data.error || 'Research gagal')
              void loadLogs()
            }
          }
        }
      } catch {
        // diam, biar polling next tick
      }
    }
    const timer = setInterval(() => void tick(), 2000)
    void tick()
  }

  function toggleSelected(modelId: string) {
    setReviewSelected((prev) => {
      const next = new Set(prev)
      if (next.has(modelId)) next.delete(modelId)
      else next.add(modelId)
      return next
    })
  }

  async function applySelected() {
    if (!job || job.status !== 'SUCCESS') return
    setApplying(true)
    try {
      const res = await fetch(
        '/api/admin/ai-pricing/presets/apply-changes',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jobId: job.id,
            modelIds: Array.from(reviewSelected),
          }),
        },
      )
      const json = (await res.json()) as {
        success: boolean
        data?: { applied: number }
        error?: string
      }
      if (!res.ok || !json.success || !json.data) {
        toast.error(json.error || 'Gagal apply')
        return
      }
      toast.success(`${json.data.applied} model di-update`)
      setJob(null)
      setReviewSelected(new Set())
      void loadPresets()
    } finally {
      setApplying(false)
    }
  }

  function closeJob() {
    setJob(null)
    setReviewSelected(new Set())
  }

  // ── Edit preset ────────────────────────────────────────────────────
  function openEdit(p: Preset) {
    setEditing(p)
    setEditName(p.displayName)
    setEditInput(String(p.inputPricePer1M))
    setEditOutput(String(p.outputPricePer1M))
  }

  async function saveEdit() {
    if (!editing) return
    setEditSaving(true)
    try {
      const res = await fetch(`/api/admin/ai-pricing/presets/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: editName.trim(),
          inputPricePer1M: Number(editInput),
          outputPricePer1M: Number(editOutput),
        }),
      })
      const json = (await res.json()) as { success: boolean; error?: string }
      if (!res.ok || !json.success) {
        toast.error(json.error || 'Gagal menyimpan')
        return
      }
      toast.success('Preset di-update')
      setEditing(null)
      void loadPresets()
    } finally {
      setEditSaving(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Section A — Header */}
      <Card>
        <CardContent className="flex items-center justify-between gap-4 py-4">
          <div>
            <h1 className="font-display text-2xl font-extrabold tracking-tight text-warm-900 dark:text-warm-50">
              Database Harga API
            </h1>
            <p className="mt-1 text-sm text-warm-500">
              {lastUpdated
                ? `Terakhir di-update: ${formatDistanceToNow(new Date(lastUpdated), { addSuffix: true, locale: idLocale })}`
                : 'Belum ada update'}
            </p>
          </div>
          <Button
            onClick={() => setConfirmOpen(true)}
            disabled={Boolean(job && job.status === 'RUNNING')}
            className="bg-primary-500 text-white hover:bg-primary-600"
          >
            <Sparkles className="mr-2 size-4" />
            🤖 Update via AI
          </Button>
        </CardContent>
      </Card>

      {/* Section C — Filter + Tabel */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-4">
            <CardTitle>Pricing Database</CardTitle>
            <div className="flex gap-2">
              <Select
                value={filterProvider}
                onValueChange={(v) => setFilterProvider(v as 'ALL' | Provider)}
              >
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Semua provider</SelectItem>
                  <SelectItem value="ANTHROPIC">Anthropic</SelectItem>
                  <SelectItem value="OPENAI">OpenAI</SelectItem>
                  <SelectItem value="GOOGLE">Google</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={filterFreshness}
                onValueChange={(v) =>
                  setFilterFreshness(v as 'ALL' | Freshness)
                }
              >
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Semua status</SelectItem>
                  <SelectItem value="verified">🟢 Verified</SelectItem>
                  <SelectItem value="stale">🟡 Stale</SelectItem>
                  <SelectItem value="outdated">🔴 Outdated</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Provider</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead className="text-right">Input $/1M</TableHead>
                  <TableHead className="text-right">Output $/1M</TableHead>
                  <TableHead className="text-right">Context</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Updated</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Badge variant="outline" className="font-normal">
                        {p.provider}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{p.displayName}</div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {p.modelId}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPrice(p.inputPricePer1M)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPrice(p.outputPricePer1M)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {p.contextWindow
                        ? `${(p.contextWindow / 1000).toFixed(0)}K`
                        : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={cn(
                          'font-normal',
                          FRESHNESS_STYLE[p.freshnessStatus],
                        )}
                      >
                        {FRESHNESS_LABEL[p.freshnessStatus]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(p.lastUpdatedAt), {
                        addSuffix: true,
                        locale: idLocale,
                      })}
                      {p.lastUpdatedSource && (
                        <span className="ml-1">({p.lastUpdatedSource})</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => openEdit(p)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      Tidak ada preset cocok dengan filter.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Section D — Recent logs */}
      <Card>
        <CardHeader
          className="cursor-pointer"
          onClick={() => setLogsOpen((v) => !v)}
        >
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              Recent Research Logs ({logs.length})
            </CardTitle>
            {logsOpen ? (
              <ChevronUp className="size-4" />
            ) : (
              <ChevronDown className="size-4" />
            )}
          </div>
        </CardHeader>
        {logsOpen && (
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>Trigger</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Updated</TableHead>
                  <TableHead className="text-right">Added</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="text-xs">
                      {new Date(l.startedAt).toLocaleString('id-ID')}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {l.triggeredBy.slice(0, 8)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={cn(
                          'font-normal',
                          l.status === 'SUCCESS' &&
                            'bg-emerald-100 text-emerald-700',
                          l.status === 'FAILED' && 'bg-red-100 text-red-700',
                          l.status === 'RUNNING' &&
                            'bg-amber-100 text-amber-800',
                        )}
                      >
                        {l.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {l.modelsUpdated}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {l.modelsAdded}
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-xs text-red-600">
                      {l.error ?? ''}
                    </TableCell>
                  </TableRow>
                ))}
                {logs.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      Belum ada research log.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        )}
      </Card>

      {/* Confirm dialog */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Update harga via AI Research?</AlertDialogTitle>
            <AlertDialogDescription>
              Akan menggunakan ~5K token Anthropic API (Claude Sonnet 4.5 +
              web_search). Estimasi biaya: <strong>Rp 500</strong>. Lanjut?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={startResearch}>
              Ya, jalankan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Loading + Section B — Review modal */}
      <Dialog
        open={Boolean(job)}
        onOpenChange={(open) => {
          if (!open && job?.status !== 'RUNNING') closeJob()
        }}
      >
        <DialogContent className="max-w-2xl">
          {job?.status === 'RUNNING' && (
            <>
              <DialogHeader>
                <DialogTitle>Research sedang berjalan...</DialogTitle>
                <DialogDescription>
                  Claude lagi cari harga di sumber resmi. ~30-60 detik.
                </DialogDescription>
              </DialogHeader>
              <ul className="space-y-2 text-sm">
                {RESEARCH_STEPS.map((step, i) => (
                  <li
                    key={step}
                    className={cn(
                      'flex items-center gap-2',
                      i < stepIdx && 'text-emerald-700',
                      i === stepIdx && 'font-medium',
                      i > stepIdx && 'text-muted-foreground',
                    )}
                  >
                    {i < stepIdx ? (
                      <Check className="size-4" />
                    ) : i === stepIdx ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <span className="size-4" />
                    )}
                    {step}
                  </li>
                ))}
              </ul>
            </>
          )}
          {job?.status === 'SUCCESS' && job.diff && (
            <>
              <DialogHeader>
                <DialogTitle>Hasil Research</DialogTitle>
                <DialogDescription>
                  Pilih perubahan yang mau di-apply.
                </DialogDescription>
              </DialogHeader>
              <div className="max-h-[60vh] space-y-4 overflow-y-auto">
                {job.diff.added.length > 0 && (
                  <Section title={`🆕 ${job.diff.added.length} model baru`}>
                    {job.diff.added.map((d) => (
                      <DiffRow
                        key={d.modelId}
                        d={d}
                        checked={reviewSelected.has(d.modelId)}
                        onToggle={() => toggleSelected(d.modelId)}
                      />
                    ))}
                  </Section>
                )}
                {job.diff.updated.length > 0 && (
                  <Section title={`📝 ${job.diff.updated.length} model berubah`}>
                    {job.diff.updated.map((d) => (
                      <DiffRow
                        key={d.modelId}
                        d={d}
                        checked={reviewSelected.has(d.modelId)}
                        onToggle={() => toggleSelected(d.modelId)}
                      />
                    ))}
                  </Section>
                )}
                {job.diff.unchanged.length > 0 && (
                  <p className="text-sm text-muted-foreground">
                    ✅ {job.diff.unchanged.length} model tidak berubah
                    (auto-skipped)
                  </p>
                )}
                {job.diff.added.length === 0 && job.diff.updated.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Tidak ada perubahan harga.
                  </p>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={closeJob}>
                  Cancel
                </Button>
                <Button
                  onClick={applySelected}
                  disabled={applying || reviewSelected.size === 0}
                >
                  {applying && <Loader2 className="mr-2 size-4 animate-spin" />}
                  Apply Selected ({reviewSelected.size})
                </Button>
              </DialogFooter>
            </>
          )}
          {job?.status === 'FAILED' && (
            <>
              <DialogHeader>
                <DialogTitle className="text-red-600">
                  Research gagal
                </DialogTitle>
                <DialogDescription>{job.error}</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={closeJob}>
                  <X className="mr-2 size-4" /> Tutup
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit preset modal */}
      <Dialog
        open={Boolean(editing)}
        onOpenChange={(o) => {
          if (!o && !editSaving) setEditing(null)
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit preset</DialogTitle>
            <DialogDescription>
              {editing?.modelId} — manual override (akan tag sebagai 'manual').
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="ed-name">Display name</Label>
              <Input
                id="ed-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ed-in">Input $/1M</Label>
                <Input
                  id="ed-in"
                  type="number"
                  step="0.001"
                  min={0}
                  value={editInput}
                  onChange={(e) => setEditInput(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ed-out">Output $/1M</Label>
                <Input
                  id="ed-out"
                  type="number"
                  step="0.001"
                  min={0}
                  value={editOutput}
                  onChange={(e) => setEditOutput(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditing(null)}
              disabled={editSaving}
            >
              Batal
            </Button>
            <Button onClick={saveEdit} disabled={editSaving}>
              {editSaving && <Loader2 className="mr-2 size-4 animate-spin" />}
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold">{title}</p>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

function DiffRow({
  d,
  checked,
  onToggle,
}: {
  d: DiffEntry
  checked: boolean
  onToggle: () => void
}) {
  const naik =
    d.before && d.after.inputPricePer1M > d.before.inputPricePer1M
  return (
    <label className="flex cursor-pointer items-start gap-2 rounded-md border p-2 hover:bg-warm-50 dark:hover:bg-warm-900/30">
      <Checkbox
        checked={checked}
        onCheckedChange={onToggle}
        className="mt-0.5"
      />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-medium">{d.after.displayName}</p>
        <p className="font-mono text-xs text-muted-foreground">
          {d.after.modelId}
        </p>
        <p className="mt-1 text-xs">
          {d.before ? (
            <>
              ${d.before.inputPricePer1M.toFixed(2)}/$
              {d.before.outputPricePer1M.toFixed(2)} →{' '}
              <strong>
                ${d.after.inputPricePer1M.toFixed(2)}/$
                {d.after.outputPricePer1M.toFixed(2)}
              </strong>{' '}
              {naik ? '⚠️ naik' : '✓ turun'}
            </>
          ) : (
            <>
              ${d.after.inputPricePer1M.toFixed(2)} input / $
              {d.after.outputPricePer1M.toFixed(2)} output
            </>
          )}
        </p>
      </div>
    </label>
  )
}
