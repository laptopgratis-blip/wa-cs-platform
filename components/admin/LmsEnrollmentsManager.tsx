'use client'

// LmsEnrollmentsManager — admin search enrollment + manual add/revoke.
//
// Server-side admin gate sudah di middleware (/admin/* require ADMIN);
// tapi data API juga gate via session role di endpoint.
import {
  GraduationCap,
  Loader2,
  Plus,
  RotateCcw,
  Search,
  XCircle,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
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

interface Enrollment {
  id: string
  studentPhone: string
  studentName: string | null
  studentEmail: string | null
  invoiceNumber: string | null
  status: 'ACTIVE' | 'REVOKED' | 'EXPIRED'
  enrolledAt: string
  expiresAt: string | null
  revokeReason: string | null
  course: {
    id: string
    title: string
    slug: string
    userId: string
  }
}

interface Course {
  id: string
  title: string
  userId: string
}

const ANY = '__any__'

export function LmsEnrollmentsManager() {
  const [phone, setPhone] = useState('')
  const [invoice, setInvoice] = useState('')
  const [status, setStatus] = useState<string>(ANY)
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [loading, setLoading] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [allCourses, setAllCourses] = useState<Course[]>([])

  async function search() {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (phone.trim()) params.set('phone', phone.trim())
      if (invoice.trim()) params.set('invoice', invoice.trim())
      if (status !== ANY) params.set('status', status)
      const res = await fetch(`/api/admin/lms-enrollments?${params}`)
      const json = await res.json()
      if (!res.ok || !json.success) {
        toast.error(json.message || 'Gagal load')
        return
      }
      setEnrollments(json.data.enrollments)
    } finally {
      setLoading(false)
    }
  }

  // Initial load
  useEffect(() => {
    search()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadCourses() {
    // Untuk admin, fetch semua course via internal endpoint (kita reuse
    // endpoint penjual — admin lihat satu user course-nya saja). Untuk
    // Phase 1, admin fetch via prisma direct query lebih ideal, tapi kita
    // skip dan biarkan admin input courseId manual.
    // Future: bikin /api/admin/lms-courses untuk list semua.
    // Phase 1 quick: manual courseId input.
    setAllCourses([])
  }

  async function revoke(id: string) {
    const reason = prompt('Alasan revoke?', 'Refund')
    if (!reason) return
    const res = await fetch(`/api/admin/lms-enrollments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'revoke', reason }),
    })
    const json = await res.json()
    if (!res.ok || !json.success) {
      toast.error(json.message || 'Gagal')
      return
    }
    toast.success('Enrollment di-revoke')
    search()
  }

  async function reactivate(id: string) {
    const res = await fetch(`/api/admin/lms-enrollments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reactivate' }),
    })
    const json = await res.json()
    if (!res.ok || !json.success) {
      toast.error(json.message || 'Gagal')
      return
    }
    toast.success('Enrollment di-reactivate')
    search()
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <GraduationCap className="size-5 text-primary-500" />
            <h1 className="font-display text-2xl font-extrabold tracking-tight">
              Enrollment LMS
            </h1>
          </div>
          <p className="text-sm text-warm-500">
            Akses student per course. Hook auto-enroll saat order PAID; manual
            add untuk kasus refund/courtesy.
          </p>
        </div>
        <Button
          onClick={() => {
            void loadCourses()
            setAddOpen(true)
          }}
          className="bg-primary-500 text-white hover:bg-primary-600"
        >
          <Plus className="mr-2 size-4" />
          Manual Add
        </Button>
      </header>

      <Card>
        <CardContent className="p-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="space-y-1">
              <Label className="text-xs">Phone (cari)</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0812..."
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Invoice (cari)</Label>
              <Input
                value={invoice}
                onChange={(e) => setInvoice(e.target.value)}
                placeholder="INV-..."
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>Semua</SelectItem>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="REVOKED">Revoked</SelectItem>
                  <SelectItem value="EXPIRED">Expired</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                onClick={search}
                disabled={loading}
                className="w-full"
                variant="outline"
              >
                {loading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <>
                    <Search className="mr-2 size-4" />
                    Cari
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {enrollments.length === 0 ? (
            <div className="py-12 text-center text-sm text-warm-500">
              {loading ? 'Loading...' : 'Tidak ada enrollment yang cocok.'}
            </div>
          ) : (
            <div className="divide-y divide-warm-100">
              {enrollments.map((e) => (
                <div
                  key={e.id}
                  className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-semibold">
                        {e.studentPhone}
                      </span>
                      {e.studentName && (
                        <span className="text-sm text-warm-700">
                          · {e.studentName}
                        </span>
                      )}
                      <Badge
                        className={
                          e.status === 'ACTIVE'
                            ? 'bg-emerald-100 text-emerald-700'
                            : e.status === 'REVOKED'
                              ? 'bg-rose-100 text-rose-700'
                              : 'bg-warm-100 text-warm-700'
                        }
                      >
                        {e.status}
                      </Badge>
                    </div>
                    <div className="text-xs text-warm-600">
                      Course: <strong>{e.course.title}</strong> ·{' '}
                      <span className="text-warm-400">/{e.course.slug}</span>
                    </div>
                    <div className="text-xs text-warm-500">
                      Enrolled{' '}
                      {new Date(e.enrolledAt).toLocaleDateString('id-ID')}
                      {e.invoiceNumber && <> · Invoice {e.invoiceNumber}</>}
                      {e.revokeReason && (
                        <> · Revoke: {e.revokeReason}</>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {e.status === 'ACTIVE' ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => revoke(e.id)}
                      >
                        <XCircle className="mr-1.5 size-3.5" />
                        Revoke
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => reactivate(e.id)}
                      >
                        <RotateCcw className="mr-1.5 size-3.5" />
                        Reactivate
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {addOpen && (
        <ManualAddDialog
          onClose={() => setAddOpen(false)}
          onSaved={() => {
            setAddOpen(false)
            search()
          }}
        />
      )}
    </div>
  )
}

function ManualAddDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void
  onSaved: () => void
}) {
  const [courseId, setCourseId] = useState('')
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function save() {
    if (!courseId.trim() || !phone.trim()) {
      toast.error('Course ID dan phone wajib diisi')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/lms-enrollments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseId: courseId.trim(),
          studentPhone: phone.trim(),
          studentName: name.trim() || null,
          studentEmail: email.trim() || null,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        toast.error(json.message || json.error || 'Gagal')
        return
      }
      toast.success('Enrollment dibuat')
      onSaved()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manual Add Enrollment</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Course ID</Label>
            <Input
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              placeholder="cmoxxx... (copy dari /lms/courses URL)"
              className="font-mono text-xs"
            />
            <p className="text-[11px] text-warm-500">
              Phase 1 — copy course ID dari URL halaman edit course. Phase 2
              dropdown picker.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Phone Student (E.164 atau 08xxx)</Label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="081234567890"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Nama (opsional)</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Email (opsional)</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button
            onClick={save}
            disabled={submitting}
            className="bg-primary-500 text-white hover:bg-primary-600"
          >
            {submitting ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Plus className="mr-2 size-4" />
            )}
            Tambah
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
