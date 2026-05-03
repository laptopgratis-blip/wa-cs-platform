'use client'

// Wrapper client untuk halaman /soul. Tampilkan list + Sheet untuk
// create/edit. Refresh setelah submit/delete via router.refresh().
import { Pencil, Plus, Sparkles, Star } from 'lucide-react'
import { useState } from 'react'

import { SoulForm, type SoulInitialValues } from '@/components/soul/SoulForm'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  LANGUAGES,
  PERSONALITIES,
  REPLY_STYLES,
  type Language,
  type Personality,
  type ReplyStyle,
} from '@/lib/soul'

export interface SoulListItem {
  id: string
  name: string
  personality: Personality | null
  language: Language
  replyStyle: ReplyStyle | null
  businessContext: string | null
  isDefault: boolean
  usageCount: number
}

interface SoulListProps {
  souls: SoulListItem[]
}

export function SoulList({ souls }: SoulListProps) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<SoulInitialValues | null>(null)

  function openCreate() {
    setEditing(null)
    setOpen(true)
  }

  function openEdit(soul: SoulListItem) {
    setEditing({
      id: soul.id,
      name: soul.name,
      personality: soul.personality,
      language: soul.language,
      replyStyle: soul.replyStyle,
      businessContext: soul.businessContext,
      isDefault: soul.isDefault,
    })
    setOpen(true)
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-warm-900 dark:text-warm-50">
            Soul
          </h1>
          <p className="mt-1 text-sm text-warm-500">
            Atur kepribadian AI yang akan membalas pesan customer.
          </p>
        </div>
        <Button
          onClick={openCreate}
          className="bg-primary-500 text-white shadow-orange hover:bg-primary-600"
        >
          <Plus className="mr-2 size-4" />
          Buat Soul
        </Button>
      </div>

      {souls.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Sparkles className="size-8 text-muted-foreground" />
            <div>
              <p className="font-medium">Belum ada soul</p>
              <p className="text-sm text-muted-foreground">
                Buat soul pertamamu — AI butuh kepribadian sebelum bisa balas pesan.
              </p>
            </div>
            <Button onClick={openCreate}>
              <Plus className="mr-2 size-4" />
              Buat Soul Pertama
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {souls.map((s) => (
            <Card
              key={s.id}
              className="cursor-pointer rounded-xl border-warm-200 shadow-sm hover-lift"
            >
              <CardContent className="space-y-3 p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate font-display font-bold text-warm-900 dark:text-warm-50">
                        {s.name}
                      </h3>
                      {s.isDefault && (
                        <Badge className="gap-1 bg-primary-500 text-white hover:bg-primary-500">
                          <Star className="size-3" /> Default
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {s.personality && (
                        <Badge variant="secondary" className="font-normal">
                          {labelFor(PERSONALITIES, s.personality)}
                        </Badge>
                      )}
                      <Badge variant="outline" className="font-normal">
                        {labelFor(LANGUAGES, s.language)}
                      </Badge>
                      {s.replyStyle && (
                        <Badge variant="outline" className="font-normal">
                          {labelFor(REPLY_STYLES, s.replyStyle)}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => openEdit(s)}>
                    <Pencil className="size-4" />
                  </Button>
                </div>

                {s.businessContext && (
                  <p className="line-clamp-3 text-sm text-muted-foreground">
                    {s.businessContext}
                  </p>
                )}

                <p className="text-xs text-muted-foreground">
                  Dipakai {s.usageCount} WA session
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="w-full overflow-y-auto sm:max-w-3xl px-6"
        >
          <SheetHeader className="px-0">
            <SheetTitle>{editing ? 'Edit Soul' : 'Buat Soul Baru'}</SheetTitle>
            <SheetDescription>
              Atur kepribadian dan konteks bisnis. Preview akan update saat kamu mengetik.
            </SheetDescription>
          </SheetHeader>
          <SoulForm initial={editing ?? undefined} onDone={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </>
  )
}

function labelFor<T extends { value: string; label: string }>(
  options: readonly T[],
  value: string,
): string {
  return options.find((o) => o.value === value)?.label ?? value
}
