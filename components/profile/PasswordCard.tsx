'use client'

// Card keamanan: ganti password (atau set password pertama untuk user
// Google/OTP-only yang belum punya). Field "password lama" hanya tampil
// kalau user sudah punya password — keputusan finalnya tetap di server.
import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { changePasswordSchema } from '@/lib/validations/profile'

export function PasswordCard({
  initialHasPassword,
  email,
}: {
  initialHasPassword: boolean
  email: string
}) {
  const [hasPassword, setHasPassword] = useState(initialHasPassword)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const parsed = changePasswordSchema.safeParse({
      currentPassword: currentPassword || undefined,
      newPassword,
      confirmPassword,
    })
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Data tidak valid')
      return
    }
    if (hasPassword && !currentPassword) {
      toast.error('Password saat ini wajib diisi')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/profile/password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(parsed.data),
      })
      const json = (await res.json()) as {
        success: boolean
        data?: { message: string }
        error?: string
      }
      if (!json.success) throw new Error(json.error ?? 'Gagal mengubah password')
      toast.success(json.data?.message ?? 'Password berhasil diubah')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setHasPassword(true)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {hasPassword ? 'Ganti Password' : 'Atur Password'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!hasPassword && (
          <p className="mb-4 rounded-md bg-sky-50 p-3 text-xs text-sky-800">
            Akun kamu login via Google/OTP dan belum punya password. Atur
            password supaya bisa juga login pakai email &amp; password.
          </p>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Field username tersembunyi — password manager butuh ini untuk
              mengaitkan password baru dengan akun yang benar. */}
          <input
            type="text"
            name="username"
            value={email}
            autoComplete="username"
            readOnly
            hidden
          />
          {hasPassword && (
            <div className="space-y-2">
              <Label htmlFor="current-password">Password saat ini</Label>
              <Input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                disabled={saving}
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="new-password">Password baru</Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              disabled={saving}
              placeholder="Minimal 6 karakter"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Konfirmasi password baru</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              disabled={saving}
            />
          </div>
          <Button type="submit" disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" /> Menyimpan…
              </>
            ) : hasPassword ? (
              'Ganti Password'
            ) : (
              'Atur Password'
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
