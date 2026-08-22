'use client'

// SettingsManager — form key-value untuk pengaturan platform.
// Save per-field (PATCH dengan dirty-check) supaya UX jelas mana yang
// barusan disimpan tanpa overwrite field lain.
import { Loader2, Save } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { PageHeader } from '@/components/shared/PageHeader'
import { CardGridSkeleton } from '@/components/shared/skeletons'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TONES } from '@/lib/ui-tones'
import { cn } from '@/lib/utils'

interface Settings {
  WA_ADMIN: string
  PLATFORM_NAME: string
  SUPPORT_EMAIL: string
  DOCS_URL: string
  SUPPORT_HOURS: string
}

// Satu sumber initial state — dipakai `values` DAN `savedSnapshot`. Dulu dua
// objek literal terpisah yang harus disamakan manual saat menambah field.
const EMPTY_SETTINGS: Settings = {
  WA_ADMIN: '',
  PLATFORM_NAME: '',
  SUPPORT_EMAIL: '',
  DOCS_URL: '',
  SUPPORT_HOURS: '',
}

const FIELDS: {
  key: keyof Settings
  label: string
  placeholder: string
  helper: string
  type?: string
  inputMode?: 'numeric'
}[] = [
  {
    key: 'WA_ADMIN',
    label: 'Nomor WA Admin',
    placeholder: '6281234567890',
    helper:
      'Nomor WhatsApp admin untuk terima konfirmasi transfer dari user. Format internasional tanpa + (contoh: 6281234567890).',
    inputMode: 'numeric',
  },
  {
    key: 'PLATFORM_NAME',
    label: 'Nama Platform',
    placeholder: 'Hulao',
    helper: 'Nama platform yang muncul di header email & beberapa pesan.',
  },
  {
    key: 'SUPPORT_EMAIL',
    label: 'Email Support',
    placeholder: 'support@hulao.id',
    helper: 'Email yang ditampilkan di halaman Bantuan & Dukungan user.',
    type: 'email',
  },
  {
    key: 'SUPPORT_HOURS',
    label: 'Jam Operasional Support',
    placeholder: 'Senin–Jumat, 09.00–17.00 WIB',
    helper:
      'Ditampilkan di halaman Bantuan & Dukungan supaya user tahu kapan admin membalas.',
  },
  {
    key: 'DOCS_URL',
    label: 'URL Dokumentasi',
    placeholder: 'https://docs.hulao.id',
    helper:
      'Alamat situs dokumentasi eksternal (wajib https). Kosongkan kalau belum ada — halaman Dokumentasi tetap menampilkan sumber internal.',
    type: 'url',
  },
]

export function SettingsManager() {
  const [values, setValues] = useState<Settings>(EMPTY_SETTINGS)
  const [savedSnapshot, setSavedSnapshot] = useState<Settings>(EMPTY_SETTINGS)
  const [isLoading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState<keyof Settings | null>(null)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/settings')
      const json = (await res.json()) as { success: boolean; data?: Settings }
      if (json.success && json.data) {
        setValues(json.data)
        setSavedSnapshot(json.data)
      }
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    void load()
  }, [])

  async function handleSave(key: keyof Settings) {
    const value = values[key].trim()
    setSavingKey(key)
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value }),
      })
      const json = (await res.json()) as { success: boolean; error?: string }
      if (!res.ok || !json.success) {
        toast.error(json.error || 'Gagal menyimpan')
        return
      }
      setSavedSnapshot({ ...savedSnapshot, [key]: value })
      setValues({ ...values, [key]: value })
      toast.success('Tersimpan')
    } finally {
      setSavingKey(null)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Pengaturan Platform"
        description="Setting global yang dipakai di seluruh aplikasi."
      />

      {isLoading ? (
        <CardGridSkeleton count={3} />
      ) : (
        <div className="space-y-4">
          {FIELDS.map((f) => {
            const dirty = values[f.key] !== savedSnapshot[f.key]
            const isSaving = savingKey === f.key
            return (
              <Card key={f.key} className="border-warm-200 rounded-xl">
                <CardHeader className="pb-2">
                  <CardTitle className="text-warm-900 text-sm font-semibold">
                    {f.label}
                  </CardTitle>
                  <CardDescription className="text-warm-500 text-xs">
                    {f.helper}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor={`set-${f.key}`} className="sr-only">
                      {f.label}
                    </Label>
                    <Input
                      id={`set-${f.key}`}
                      type={f.type ?? 'text'}
                      inputMode={f.inputMode}
                      placeholder={f.placeholder}
                      value={values[f.key]}
                      onChange={(e) => {
                        const v =
                          f.inputMode === 'numeric'
                            ? e.target.value.replace(/\D/g, '')
                            : e.target.value
                        setValues({ ...values, [f.key]: v })
                      }}
                      maxLength={500}
                    />
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    {dirty && !isSaving && (
                      <span className={cn('text-xs', TONES.warning.text)}>
                        Belum disimpan
                      </span>
                    )}
                    <Button
                      size="sm"
                      onClick={() => handleSave(f.key)}
                      disabled={!dirty || isSaving}
                    >
                      {isSaving ? (
                        <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                      ) : (
                        <Save className="mr-1.5 size-3.5" />
                      )}
                      Simpan
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
