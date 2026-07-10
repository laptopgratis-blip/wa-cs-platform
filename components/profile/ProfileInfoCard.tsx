'use client'

// Card info akun: avatar, edit nama, email/WA read-only + badge verified.
// Setelah nama tersimpan: useSession().update() → JWT re-fetch nama dari DB
// (lihat lib/auth.ts trigger 'update'), lalu router.refresh() supaya Topbar
// (server component) langsung tampil nama baru.
import { Loader2, User as UserIcon } from 'lucide-react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updateProfileSchema } from '@/lib/validations/profile'

interface ProfileInfoCardProps {
  initialName: string
  email: string
  image: string | null
  phoneNumber: string | null
  emailVerified: boolean
  phoneVerified: boolean
  // Sudah diformat di server (hindari hydration mismatch beda timezone).
  memberSinceLabel: string
}

export function ProfileInfoCard({
  initialName,
  email,
  image,
  phoneNumber,
  emailVerified,
  phoneVerified,
  memberSinceLabel,
}: ProfileInfoCardProps) {
  const router = useRouter()
  const { update } = useSession()
  const [name, setName] = useState(initialName)
  const [savedName, setSavedName] = useState(initialName)
  const [saving, setSaving] = useState(false)

  const initials = (savedName || email || 'U')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .join('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const parsed = updateProfileSchema.safeParse({ name })
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Nama tidak valid')
      return
    }
    if (parsed.data.name === savedName) return
    setSaving(true)
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(parsed.data),
      })
      const json = (await res.json()) as {
        success: boolean
        data?: { name: string }
        error?: string
      }
      if (!json.success || !json.data) {
        throw new Error(json.error ?? 'Gagal menyimpan profil')
      }
      setSavedName(json.data.name)
      setName(json.data.name)
      toast.success('Profil disimpan')
      // Refresh JWT (tanpa payload — server re-fetch dari DB) lalu re-render
      // server components supaya Topbar langsung tampil nama baru.
      await update()
      router.refresh()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Informasi Akun</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center gap-4">
          <Avatar className="size-14 bg-primary-100 text-primary-700">
            {image && <AvatarImage src={image} alt={savedName} />}
            <AvatarFallback className="bg-primary-100 text-lg font-semibold text-primary-700">
              {initials || <UserIcon className="size-6" />}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="truncate font-medium">{savedName || 'Pengguna'}</div>
            <div className="text-xs text-muted-foreground">
              Member sejak {memberSinceLabel}
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-2">
          <Label htmlFor="profile-name">Nama</Label>
          <div className="flex gap-2">
            <Input
              id="profile-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              disabled={saving}
              placeholder="Nama kamu"
            />
            <Button type="submit" disabled={saving || name.trim() === savedName}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : 'Simpan'}
            </Button>
          </div>
        </form>

        <div className="space-y-3 border-t pt-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-xs text-muted-foreground">Email</div>
              <div className="break-all">{email}</div>
            </div>
            {emailVerified ? (
              <Badge className="bg-emerald-100 text-emerald-700">Terverifikasi</Badge>
            ) : (
              <Badge className="bg-warm-100 text-warm-600">Belum verifikasi</Badge>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-xs text-muted-foreground">Nomor WhatsApp</div>
              <div>{phoneNumber ?? '—'}</div>
            </div>
            {phoneNumber ? (
              phoneVerified ? (
                <Badge className="bg-emerald-100 text-emerald-700">Terverifikasi</Badge>
              ) : (
                <Badge className="bg-warm-100 text-warm-600">Belum verifikasi</Badge>
              )
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            Email dan nomor WhatsApp belum bisa diubah dari halaman ini.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
