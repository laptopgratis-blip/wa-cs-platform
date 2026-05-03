'use client'

// Halaman /contacts: tabel + filter + search + slide-over detail.
import type { PipelineStage } from '@prisma/client'
import { Loader2, Search } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { ContactDetailSheet } from '@/components/contacts/ContactDetailSheet'
import { PipelineBadge } from '@/components/contacts/PipelineBadge'
import type { ContactRow } from '@/components/contacts/types'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
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
import { formatRelativeTime } from '@/lib/format-time'
import { PIPELINE_LABELS } from '@/lib/validations/contact'

interface ContactsViewProps {
  initialContacts: ContactRow[]
  initialTags: string[]
  initialTotal: number
}

const STAGES: PipelineStage[] = [
  'NEW',
  'PROSPECT',
  'INTEREST',
  'NEGOTIATION',
  'CLOSED_WON',
  'CLOSED_LOST',
]

const ANY = '__ANY__'

export function ContactsView({
  initialContacts,
  initialTags,
  initialTotal,
}: ContactsViewProps) {
  const [contacts, setContacts] = useState(initialContacts)
  const [tags, setTags] = useState(initialTags)
  const [total, setTotal] = useState(initialTotal)
  const [stage, setStage] = useState<PipelineStage | typeof ANY>(ANY)
  const [tagFilter, setTagFilter] = useState<string>(ANY)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [isLoading, setLoading] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)

  const isFirst = useRef(true)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [search])

  const fetchList = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (stage !== ANY) params.set('stage', stage)
      if (tagFilter !== ANY) params.set('tag', tagFilter)
      if (debouncedSearch) params.set('search', debouncedSearch)
      const res = await fetch(`/api/contacts?${params}`)
      const json = (await res.json()) as {
        success: boolean
        data?: { contacts: ContactRow[]; total: number; tags: string[] }
      }
      if (json.success && json.data) {
        setContacts(json.data.contacts)
        setTotal(json.data.total)
        setTags(json.data.tags)
      }
    } finally {
      setLoading(false)
    }
  }, [stage, tagFilter, debouncedSearch])

  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false
      return
    }
    void fetchList()
  }, [fetchList])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-warm-900 dark:text-warm-50">
          Contacts
        </h1>
        <p className="mt-1 text-sm text-warm-500">
          Kelola customer — ubah pipeline stage, tag, catatan, dan lihat history.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama atau nomor..."
            className="pl-8"
          />
        </div>
        <Select value={stage} onValueChange={(v) => setStage(v as PipelineStage | typeof ANY)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Semua stage" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Semua stage</SelectItem>
            {STAGES.map((s) => (
              <SelectItem key={s} value={s}>
                {PIPELINE_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={tagFilter} onValueChange={setTagFilter} disabled={tags.length === 0}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder={tags.length === 0 ? 'Belum ada tag' : 'Semua tag'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Semua tag</SelectItem>
            {tags.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="ml-auto text-sm text-muted-foreground">
          {isLoading ? <Loader2 className="size-4 animate-spin" /> : `${total} kontak`}
        </span>
      </div>

      {contacts.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            Belum ada kontak yang cocok dengan filter.
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kontak</TableHead>
                <TableHead>Tags</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Pesan terakhir</TableHead>
                <TableHead className="text-right">Tanggal masuk</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contacts.map((c) => (
                <TableRow
                  key={c.id}
                  className="cursor-pointer"
                  onClick={() => setOpenId(c.id)}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="size-8">
                        {c.avatar && <AvatarImage src={c.avatar} alt={c.name ?? ''} />}
                        <AvatarFallback className="text-[10px]">
                          {(c.name || c.phoneNumber).slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">
                          {c.name || `+${c.phoneNumber}`}
                        </p>
                        <p className="text-xs text-muted-foreground">+{c.phoneNumber}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {c.tags.length === 0 ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        c.tags.slice(0, 3).map((t) => (
                          <Badge key={t} variant="secondary" className="font-normal">
                            {t}
                          </Badge>
                        ))
                      )}
                      {c.tags.length > 3 && (
                        <Badge variant="outline" className="font-normal">
                          +{c.tags.length - 3}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <PipelineBadge stage={c.pipelineStage} />
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {formatRelativeTime(c.lastMessageAt)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">
                    {formatRelativeTime(c.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ContactDetailSheet
        contactId={openId}
        onOpenChange={(open) => {
          if (!open) setOpenId(null)
        }}
        onSaved={fetchList}
      />
    </div>
  )
}
