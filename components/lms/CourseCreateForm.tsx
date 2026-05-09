'use client'

import { Loader2, Sparkles } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { formatRupiah } from '@/lib/format'

interface Pkg {
  id: string
  name: string
  price: number
}

const NONE = '__none__'

export function CourseCreateForm({
  availableProducts,
}: {
  availableProducts: Pkg[]
}) {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [productId, setProductId] = useState<string>(NONE)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) {
      toast.error('Judul course wajib diisi')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/lms/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          productId: productId === NONE ? null : productId,
        }),
      })
      const json = (await res.json()) as {
        success: boolean
        data?: { course: { id: string } }
        error?: string
        message?: string
      }
      if (!res.ok || !json.success || !json.data) {
        toast.error(json.message || json.error || 'Gagal bikin course')
        return
      }
      toast.success('Course dibuat. Tambah module + lesson sekarang.')
      router.push(`/lms/courses/${json.data.course.id}/edit`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card>
      <CardContent className="p-5">
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-1.5">
            <Label htmlFor="title">Judul Course</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Mis. Cara Jualan Online untuk Pemula"
              maxLength={200}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Deskripsi (opsional)</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Apa yg akan dipelajari student? Untuk siapa course ini cocok?"
              maxLength={2000}
              rows={4}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="product">Link ke Produk (opsional, bisa nanti)</Label>
            {availableProducts.length === 0 ? (
              <p className="text-xs text-warm-500">
                Belum ada produk available. Bikin produk dulu di /products,
                lalu link course ke produk dari halaman edit.
              </p>
            ) : (
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger>
                  <SelectValue placeholder="Belum di-link" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— Belum di-link —</SelectItem>
                  {availableProducts.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                      {p.price > 0 && ` · ${formatRupiah(p.price)}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <p className="text-[11px] text-warm-500">
              Saat customer beli produk yang di-link, akses course aktif
              otomatis. Bisa di-set/ubah nanti dari halaman edit course.
            </p>
          </div>

          <Button
            type="submit"
            disabled={submitting}
            className="w-full bg-primary-500 text-white hover:bg-primary-600"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Membuat...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 size-4" />
                Buat Course
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
