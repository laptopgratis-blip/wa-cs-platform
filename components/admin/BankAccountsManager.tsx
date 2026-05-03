'use client'

// CRUD Rekening Bank tujuan transfer manual. Tampil sebagai grid kartu.
import { Building2, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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

interface BankAccountRow {
  id: string
  bankName: string
  accountNumber: string
  accountName: string
  isActive: boolean
  createdAt: string
}

export function BankAccountsManager() {
  const [rows, setRows] = useState<BankAccountRow[]>([])
  const [isLoading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<BankAccountRow | null>(null)
  const [bankName, setBankName] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [accountName, setAccountName] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [isSaving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/bank-accounts')
      const json = (await res.json()) as { success: boolean; data?: BankAccountRow[] }
      if (json.success && json.data) setRows(json.data)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    void load()
  }, [])

  function openCreate() {
    setEditing(null)
    setBankName('')
    setAccountNumber('')
    setAccountName('')
    setIsActive(true)
    setOpen(true)
  }
  function openEdit(b: BankAccountRow) {
    setEditing(b)
    setBankName(b.bankName)
    setAccountNumber(b.accountNumber)
    setAccountName(b.accountName)
    setIsActive(b.isActive)
    setOpen(true)
  }

  async function save() {
    setSaving(true)
    try {
      const body = {
        bankName: bankName.trim(),
        accountNumber: accountNumber.trim(),
        accountName: accountName.trim(),
        isActive,
      }
      const res = await fetch(
        editing ? `/api/admin/bank-accounts/${editing.id}` : '/api/admin/bank-accounts',
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
      toast.success(editing ? 'Rekening diperbarui' : 'Rekening ditambahkan')
      setOpen(false)
      void load()
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(b: BankAccountRow) {
    const res = await fetch(`/api/admin/bank-accounts/${b.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !b.isActive }),
    })
    const json = (await res.json()) as { success: boolean; error?: string }
    if (!res.ok || !json.success) toast.error(json.error || 'Gagal toggle')
    void load()
  }

  async function remove(b: BankAccountRow) {
    if (!confirm(`Hapus rekening "${b.bankName} — ${b.accountNumber}"?`)) return
    const res = await fetch(`/api/admin/bank-accounts/${b.id}`, { method: 'DELETE' })
    const json = (await res.json()) as { success: boolean; error?: string }
    if (!res.ok || !json.success) {
      toast.error(json.error || 'Gagal menghapus')
      return
    }
    toast.success('Rekening dihapus')
    void load()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-warm-900 dark:text-warm-50">
            Rekening Bank
          </h1>
          <p className="mt-1 text-sm text-warm-500">
            Rekening tujuan transfer manual yang muncul di halaman checkout user.
          </p>
        </div>
        <Button
          onClick={openCreate}
          className="bg-primary-500 text-white shadow-orange hover:bg-primary-600"
        >
          <Plus className="mr-2 size-4" /> Tambah Rekening
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            Belum ada rekening bank. Tambahkan minimal satu rekening agar user bisa
            transfer manual.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {rows.map((b) => (
            <Card
              key={b.id}
              className="rounded-xl border-warm-200 transition-shadow hover:shadow-md"
            >
              <CardContent className="space-y-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
                    <Building2 className="size-5" />
                  </div>
                  <Badge variant={b.isActive ? 'default' : 'outline'}>
                    {b.isActive ? 'Aktif' : 'Nonaktif'}
                  </Badge>
                </div>
                <div>
                  <div className="font-display text-lg font-bold text-warm-900 dark:text-warm-50">
                    {b.bankName}
                  </div>
                  <div className="mt-1 font-mono text-sm tracking-wider text-warm-700">
                    {b.accountNumber}
                  </div>
                  <div className="mt-0.5 text-xs text-warm-500">
                    a.n. {b.accountName}
                  </div>
                </div>
                <div className="flex items-center justify-between border-t border-warm-100 pt-3">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={b.isActive}
                      onCheckedChange={() => toggleActive(b)}
                    />
                    <span className="text-xs text-warm-500">Tampilkan ke user</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(b)}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => remove(b)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md px-6">
          <SheetHeader className="px-0">
            <SheetTitle>{editing ? 'Edit Rekening' : 'Tambah Rekening'}</SheetTitle>
            <SheetDescription>
              Rekening ini akan ditampilkan di halaman checkout transfer manual.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-3 py-3">
            <div className="space-y-1.5">
              <Label htmlFor="b-name">Nama Bank</Label>
              <Input
                id="b-name"
                placeholder="mis. BCA, Mandiri, BNI"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="b-num">Nomor Rekening</Label>
              <Input
                id="b-num"
                placeholder="1234567890"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="b-acc">Nama Pemilik</Label>
              <Input
                id="b-acc"
                placeholder="PT. Nama Perusahaan / nama lengkap"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <Label>Aktif (tampil ke user)</Label>
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
