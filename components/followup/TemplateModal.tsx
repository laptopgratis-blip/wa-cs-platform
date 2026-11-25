'use client'

// Modal tambah/edit Template Follow-Up (dipisah dari TemplatesClient).
// Bila user punya sesi Cloud API (hasCloud), tampilkan pemilih Template Meta
// + pemetaan {{n}}; simpan diblok selama peta belum lengkap/sah. Tautan hanya
// dikirim ke API bila diubah — edit pesan biasa tidak ikut tervalidasi ulang.
// "Kirim dari" membatasi Template Meta ke WABA nomor pengirim (Cloud API) dan
// menyembunyikannya untuk nomor WhatsApp Web.
import { Eye, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { fetchJson } from '@/lib/fetch-json'
import { validateFollowUpMetaLink } from '@/lib/services/followup-meta-link'
import {
  type FollowUpSenderOption,
  metaTemplatesForSender,
  senderLinkConflict,
  senderTemplateWabaId,
} from '@/lib/services/followup-sender-options'
import { findCsSessionOption } from '@/lib/services/products/cs-session-options'
import {
  allowedPlaceholdersForTrigger,
  previewFollowUpText,
} from '@/lib/services/followup-placeholders'

import { FollowUpSenderSection } from './FollowUpSenderSection'
import {
  NULL_VALUE,
  readParamMap,
  type FollowUpTemplateDto,
  type FormItem,
} from './followup-template-types'
import {
  MetaTemplateLinkSection,
  type MetaLinkValue,
} from './MetaTemplateLinkSection'
import {
  TemplateFilterFields,
  type TemplateFilters,
} from './TemplateFilterFields'
import {
  useMetaTemplateOptions,
  type MetaTemplateOptions,
} from './useMetaTemplateOptions'

const NO_LINK: MetaLinkValue = { metaTemplateId: null, paramMap: [] }

function sameLink(a: MetaLinkValue, b: MetaLinkValue): boolean {
  return (
    a.metaTemplateId === b.metaTemplateId &&
    a.paramMap.length === b.paramMap.length &&
    a.paramMap.every((p, i) => p === b.paramMap[i])
  )
}

/** Pesan error tautan untuk diblok di UI; null = boleh simpan. */
function linkError(
  link: MetaLinkValue,
  trigger: string,
  options: MetaTemplateOptions,
  sender: FollowUpSenderOption | null,
): string | null {
  if (!link.metaTemplateId) return null
  const template = options.templates.find((t) => t.id === link.metaTemplateId)
  if (!template) return null // belum termuat — server tetap memvalidasi
  const conflict = senderLinkConflict(sender, template.wabaId)
  if (conflict) return conflict
  const v = validateFollowUpMetaLink({
    template,
    paramMap: link.paramMap,
    trigger,
  })
  return v.ok ? null : v.error
}

/**
 * Pilihan Template Meta untuk nomor pengirim: nomor Cloud API hanya melihat
 * template di WABA-nya (walau offline); tanpa kunci → WABA yang tersambung.
 * Tautan saat ini tetap tampil — linkError menandainya bila konflik.
 */
function optionsForSender(
  options: MetaTemplateOptions,
  sender: FollowUpSenderOption | null,
  currentId: string | null,
): MetaTemplateOptions {
  return {
    ...options,
    templates: metaTemplatesForSender(options.templates, {
      connectedWabaIds: options.connectedWabaIds,
      senderWabaId: senderTemplateWabaId(sender),
      currentId,
    }),
  }
}

function initialFilters(t: FollowUpTemplateDto | null): TemplateFilters {
  return {
    trigger: t?.trigger ?? 'ORDER_CREATED',
    delayDays: t?.delayDays ?? 0,
    paymentMethod: t?.paymentMethod ?? NULL_VALUE,
    orderType: t?.orderType ?? NULL_VALUE,
    applyOnPayment: t?.applyOnPaymentStatus ?? NULL_VALUE,
    applyOnDelivery: t?.applyOnDeliveryStatus ?? NULL_VALUE,
    scope: (t?.scope as 'GLOBAL' | 'FORM') ?? 'GLOBAL',
    orderFormId: t?.orderFormId ?? '',
  }
}

function orNull(v: string): string | null {
  return v === NULL_VALUE ? null : v
}

export function TemplateModal({
  template,
  forms,
  hasCloud,
  senderOptions,
  onClose,
  onSaved,
}: {
  template: FollowUpTemplateDto | null
  forms: FormItem[]
  hasCloud: boolean
  /** Nomor WA seller untuk "Kirim dari" (dikelompokkan per nomor). */
  senderOptions: FollowUpSenderOption[]
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(template?.name ?? '')
  const [filters, setFilters] = useState<TemplateFilters>(() =>
    initialFilters(template),
  )
  const [message, setMessage] = useState(template?.message ?? '')
  const [isActive, setIsActive] = useState(template?.isActive ?? true)
  const [showPreview, setShowPreview] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [initialLink] = useState<MetaLinkValue>(() => ({
    metaTemplateId: template?.metaTemplateId ?? null,
    paramMap: readParamMap(template?.metaParamMap),
  }))
  const [link, setLink] = useState<MetaLinkValue>(initialLink)
  const initialSender = template?.senderSessionId ?? null
  const [senderSessionId, setSenderSessionId] = useState<string | null>(
    initialSender,
  )
  const allOptions = useMetaTemplateOptions(
    hasCloud,
    initialLink.metaTemplateId,
  )

  const sender = findCsSessionOption(senderOptions, senderSessionId)
  const options = optionsForSender(allOptions, sender, link.metaTemplateId)
  // Nomor WhatsApp Web tidak memakai Template Meta → bagiannya disembunyikan
  // (tautan lama dibiarkan; dipakai lagi bila pengirim dikembalikan).
  const showMeta = hasCloud && sender?.provider !== 'BAILEYS'

  const { trigger, scope, orderFormId } = filters
  const isDaysAfter = trigger.startsWith('DAYS_AFTER')
  const linkChanged = hasCloud && !sameLink(link, initialLink)
  const senderChanged = senderSessionId !== initialSender
  const metaError = showMeta ? linkError(link, trigger, options, sender) : null

  function handleSenderChange(next: string | null) {
    setSenderSessionId(next)
    const nextSender = findCsSessionOption(senderOptions, next)
    const linked = allOptions.templates.find(
      (t) => t.id === link.metaTemplateId,
    )
    // Template Meta milik WABA lain tidak bisa dikirim dari nomor Cloud baru.
    if (linked && senderLinkConflict(nextSender, linked.wabaId)) {
      setLink(NO_LINK)
      toast.info(
        'Template Meta dikosongkan — pilih template dari WABA nomor pengirim',
      )
    }
  }
  // Ganti trigger mengubah placeholder sah → tautan lama ikut divalidasi server.
  const triggerChanged = Boolean(template) && template?.trigger !== trigger
  // Ganti nomor pengirim juga memvalidasi ulang WABA tautan di server.
  const blockOnMeta =
    metaError !== null &&
    (linkChanged ||
      senderChanged ||
      (triggerChanged && Boolean(link.metaTemplateId)))

  async function handleSave() {
    setSubmitting(true)
    try {
      const payload = {
        name,
        trigger,
        paymentMethod: orNull(filters.paymentMethod),
        orderType: orNull(filters.orderType),
        applyOnPaymentStatus: orNull(filters.applyOnPayment),
        applyOnDeliveryStatus: orNull(filters.applyOnDelivery),
        delayDays: isDaysAfter ? filters.delayDays : 0,
        message,
        scope,
        orderFormId: scope === 'FORM' ? orderFormId : null,
        isActive,
        ...(linkChanged && {
          metaTemplateId: link.metaTemplateId,
          metaParamMap: link.metaTemplateId ? link.paramMap : null,
        }),
        ...(senderChanged && { senderSessionId }),
      }
      const res = await fetchJson(
        template
          ? `/api/followup/templates/${template.id}`
          : '/api/followup/templates',
        {
          method: template ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
        'Gagal simpan template',
      )
      if (!res.ok) toast.error(res.error ?? 'Gagal simpan template')
      else onSaved()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {template ? 'Edit Template' : 'Tambah Template'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Nama Template</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <TemplateFilterFields
            value={filters}
            forms={forms}
            onChange={setFilters}
          />

          <FollowUpSenderSection
            options={senderOptions}
            value={senderSessionId}
            onChange={handleSenderChange}
          />

          <div className="space-y-2">
            <Label>Pesan WhatsApp</Label>
            <Textarea
              rows={10}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <div className="flex flex-wrap gap-1">
              {allowedPlaceholdersForTrigger(trigger).map((v) => (
                <Button
                  key={v}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setMessage((prev) => prev + v)}
                >
                  {v}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowPreview((s) => !s)}
            >
              <Eye className="mr-1 size-4" />
              {showPreview ? 'Sembunyikan' : 'Tampilkan'} Preview
            </Button>
            <div className="flex items-center gap-2">
              <Switch checked={isActive} onCheckedChange={setIsActive} />
              <Label>Aktifkan template</Label>
            </div>
          </div>

          {showPreview && (
            <pre className="bg-muted max-h-60 overflow-auto rounded p-3 text-xs whitespace-pre-wrap">
              {previewFollowUpText(message) || '(kosong)'}
            </pre>
          )}

          {showMeta && (
            <MetaTemplateLinkSection
              trigger={trigger}
              options={options}
              value={link}
              onChange={setLink}
              error={metaError}
            />
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button
            onClick={handleSave}
            disabled={
              submitting ||
              name.trim().length < 2 ||
              message.trim().length < 1 ||
              (scope === 'FORM' && !orderFormId) ||
              blockOnMeta
            }
          >
            {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
            Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
