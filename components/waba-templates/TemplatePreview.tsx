'use client'

// Preview bubble WhatsApp untuk template: header (teks/media), body dengan
// variabel tersubstitusi (param → contoh → {{n}}), footer, tombol.
import {
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Phone,
  Reply,
  Video,
  Copy,
} from 'lucide-react'

import { readTemplateButtons } from '@/lib/services/waba/template-payload'
import { cn } from '@/lib/utils'

import type { TemplateSendParamsDto, WabaTemplateDto } from './types'

export type PreviewTemplate = Pick<
  WabaTemplateDto,
  | 'category'
  | 'headerType'
  | 'headerText'
  | 'headerTextExample'
  | 'headerMediaUrl'
  | 'bodyText'
  | 'bodyExamples'
  | 'footerText'
  | 'buttons'
  | 'authAddSecurityRecommendation'
  | 'authCodeExpirationMinutes'
>

interface Props {
  template: PreviewTemplate
  params?: Partial<TemplateSendParamsDto>
  className?: string
  /** Tampilkan {{n}} apa adanya bila nilai kosong (mode editor). */
  keepPlaceholders?: boolean
}

function substitute(text: string, values: string[], keep: boolean): string {
  return text.replace(/\{\{\s*(\d+)\s*\}\}/g, (_m, n: string) => {
    const v = values[Number(n) - 1]
    if (v) return v
    return keep ? `{{${n}}}` : ''
  })
}

// Render *bold* _italic_ ~strike~ sederhana ala WA → span.
function renderWaMarkdown(text: string) {
  const parts = text.split(/(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)/g)
  return parts.map((p, i) => {
    if (/^\*[^*\n]+\*$/.test(p))
      return <strong key={i}>{p.slice(1, -1)}</strong>
    if (/^_[^_\n]+_$/.test(p)) return <em key={i}>{p.slice(1, -1)}</em>
    if (/^~[^~\n]+~$/.test(p)) return <s key={i}>{p.slice(1, -1)}</s>
    return <span key={i}>{p}</span>
  })
}

export function TemplatePreview({
  template,
  params,
  className,
  keepPlaceholders = true,
}: Props) {
  const isAuth = template.category === 'AUTHENTICATION'
  const bodyValues =
    (params?.body?.length ? params.body : template.bodyExamples) ?? []
  const headerValue =
    params?.header?.type === 'text'
      ? params.header.value
      : (template.headerTextExample ?? '')
  const buttons = readTemplateButtons(template.buttons)
  const btnParams = new Map(
    (params?.buttons ?? []).map((b) => [b.index, b.value]),
  )

  const headerType = template.headerType ?? null
  const HeaderIcon =
    headerType === 'IMAGE'
      ? ImageIcon
      : headerType === 'VIDEO'
        ? Video
        : FileText

  return (
    <div className={cn('rounded-xl bg-[#e5ddd5] p-3', className)}>
      <div className="text-warm-900 ml-auto max-w-[320px] rounded-lg rounded-tr-none bg-white px-3 py-2 text-sm leading-relaxed shadow-sm">
        {!isAuth && headerType === 'TEXT' && template.headerText && (
          <p className="mb-1 font-semibold">
            {substitute(template.headerText, [headerValue], keepPlaceholders)}
          </p>
        )}
        {!isAuth && headerType && headerType !== 'TEXT' && (
          <div className="bg-warm-100 text-warm-500 mb-2 flex h-24 items-center justify-center overflow-hidden rounded-md">
            {headerType === 'IMAGE' && template.headerMediaUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={template.headerMediaUrl}
                alt="Header"
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="flex items-center gap-1.5 text-xs">
                <HeaderIcon className="size-4" /> {headerType}
              </span>
            )}
          </div>
        )}

        {isAuth ? (
          <p className="whitespace-pre-wrap">
            <strong>{bodyValues[0] || '123456'}</strong> adalah kode verifikasi
            Anda.
            {template.authAddSecurityRecommendation
              ? ' Demi keamanan, jangan bagikan kode ini.'
              : ''}
            {template.authCodeExpirationMinutes ? (
              <span className="text-warm-500 mt-1 block text-xs">
                Kode ini berlaku {template.authCodeExpirationMinutes} menit.
              </span>
            ) : null}
          </p>
        ) : (
          <p className="whitespace-pre-wrap">
            {renderWaMarkdown(
              substitute(
                template.bodyText || ' ',
                bodyValues,
                keepPlaceholders,
              ),
            )}
          </p>
        )}

        {!isAuth && template.footerText && (
          <p className="text-warm-500 mt-1 text-xs">
            {template.footerText}
          </p>
        )}
        <p className="text-warm-400 mt-1 text-right text-xs">10:30</p>
      </div>

      {(buttons.length > 0 || isAuth) && (
        <div className="mt-1 ml-auto max-w-[320px] space-y-1">
          {isAuth && buttons.length === 0 && (
            <div className="flex items-center justify-center gap-1.5 rounded-lg bg-white py-1.5 text-sm font-medium text-sky-600 shadow-sm">
              <Copy className="size-3.5" /> Salin Kode
            </div>
          )}
          {buttons.map((b, i) => {
            const Icon =
              b.type === 'URL'
                ? ExternalLink
                : b.type === 'PHONE_NUMBER'
                  ? Phone
                  : b.type === 'QUICK_REPLY'
                    ? Reply
                    : Copy
            const label =
              b.type === 'COPY_CODE'
                ? `Salin kode ${btnParams.get(i) ?? b.example ?? ''}`.trim()
                : b.type === 'OTP'
                  ? b.text || 'Salin Kode'
                  : b.text
            return (
              <div
                key={i}
                className="flex items-center justify-center gap-1.5 rounded-lg bg-white py-1.5 text-sm font-medium text-sky-600 shadow-sm"
                title={
                  b.type === 'URL'
                    ? substitute(
                        b.url,
                        [btnParams.get(i) ?? b.example ?? ''],
                        true,
                      )
                    : undefined
                }
              >
                <Icon className="size-3.5" /> {label}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
