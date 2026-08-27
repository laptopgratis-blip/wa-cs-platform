// Starter pack template Meta bawaan hulao (bahasa `id`, nama `hulao_*`).
// Dipakai follow-up order (WI-7), notifikasi/LMS/handoff (INFO_GENERIC),
// dan platform (AUTH_OTP untuk OTP login via WABA milik hulao).
//
// Aturan isi: UTILITY kecuali LEAD_LIVE (MARKETING + "Balas STOP"); contoh
// variabel KONKRET (reviewer Meta menolak contoh generik); link diletakkan
// di parameter body; tidak diawali/diakhiri variabel.

import { prisma } from '@/lib/prisma'

import { createTemplateDraft, submitTemplate } from './templates'
import type { TemplateDraftInput } from './template-validate'

export interface StarterTemplateDef {
  purposeKey: string
  draft: TemplateDraftInput
  /** Placeholder hulao per {{n}} (index 0 = {{1}}) — dipakai follow-up. */
  metaParamMap: string[]
  /** Kriteria FollowUpTemplate default yang cocok (auto-link, WI-7). */
  matchDefault?: {
    trigger: string
    paymentMethod?: string | null
    orderType?: string | null
    delayDays?: number
  }[]
  description: string
}

const LANG = 'id'

export const STARTER_TEMPLATES: StarterTemplateDef[] = [
  {
    purposeKey: 'FOLLOWUP_ORDER_MASUK_COD',
    description: 'Konfirmasi order masuk (COD)',
    metaParamMap: ['{nama}', '{nama_toko}', '{invoice}', '{produk}', '{total}', '{alamat}', '{etd}'],
    matchDefault: [{ trigger: 'ORDER_CREATED', paymentMethod: 'COD' }],
    draft: {
      name: 'hulao_order_masuk_cod',
      language: LANG,
      category: 'UTILITY',
      bodyText:
        'Halo {{1}}, terima kasih sudah order di {{2}}. Pesanan {{3}}: {{4}}. Total {{5}} dibayar saat barang tiba (COD). Alamat kirim: {{6}}. Estimasi {{7}} hari. Balas pesan ini untuk konfirmasi atau ubah alamat.',
      bodyExamples: ['Budi', 'Toko Sehat Alami', 'INV-20260820-001', 'Madu Hutan 500ml ×2', 'Rp 150.000', 'Jl. Melati No. 5, Bandung', '2-3'],
    },
  },
  {
    purposeKey: 'FOLLOWUP_ORDER_MASUK_TRANSFER',
    description: 'Konfirmasi order masuk + instruksi transfer',
    metaParamMap: ['{nama}', '{nama_toko}', '{invoice}', '{produk}', '{total}', '{rekening}', '{invoice_url}'],
    matchDefault: [{ trigger: 'ORDER_CREATED', paymentMethod: 'TRANSFER' }, { trigger: 'ORDER_CREATED', paymentMethod: null }],
    draft: {
      name: 'hulao_order_masuk_transfer',
      language: LANG,
      category: 'UTILITY',
      bodyText:
        'Halo {{1}}, terima kasih sudah order di {{2}}. Pesanan {{3}}: {{4}}. Total bayar {{5}}. Transfer ke {{6}} dengan nominal persis. Invoice: {{7}}. Setelah transfer, balas pesan ini dengan bukti transfer ya.',
      bodyExamples: ['Budi', 'Toko Sehat Alami', 'INV-20260820-001', 'Madu Hutan 500ml ×2', 'Rp 150.000', 'BCA 1234567890 a.n. Toko Sehat Alami', 'https://hulao.id/invoice/INV-20260820-001'],
    },
  },
  {
    purposeKey: 'FOLLOWUP_REMINDER_BAYAR',
    description: 'Pengingat pembayaran (transfer belum masuk)',
    metaParamMap: ['{nama}', '{invoice}', '{total}', '{rekening}'],
    matchDefault: [{ trigger: 'DAYS_AFTER_ORDER', paymentMethod: 'TRANSFER' }],
    draft: {
      name: 'hulao_reminder_bayar',
      language: LANG,
      category: 'UTILITY',
      bodyText:
        'Halo {{1}}, pesanan {{2}} sebesar {{3}} masih menunggu pembayaran. Transfer ke {{4}} agar pesanan segera diproses. Pesanan otomatis dibatalkan jika belum ada pembayaran dalam 24 jam. Balas pesan ini kalau ada kendala.',
      bodyExamples: ['Budi', 'INV-20260820-001', 'Rp 150.000', 'BCA 1234567890 a.n. Toko Sehat Alami'],
    },
  },
  {
    purposeKey: 'FOLLOWUP_PEMBAYARAN_DITERIMA',
    description: 'Pembayaran diterima (barang fisik)',
    metaParamMap: ['{nama}', '{invoice}', '{total}', '{nama_toko}'],
    matchDefault: [{ trigger: 'PAYMENT_PAID', orderType: 'PHYSICAL' }, { trigger: 'PAYMENT_PAID', orderType: null }],
    draft: {
      name: 'hulao_pembayaran_diterima',
      language: LANG,
      category: 'UTILITY',
      bodyText:
        'Halo {{1}}, pembayaran pesanan {{2}} sebesar {{3}} sudah kami terima. Pesanan segera kami proses dan kirim. Kami kabari lagi saat sudah dikirim. Terima kasih sudah belanja di {{4}}.',
      bodyExamples: ['Budi', 'INV-20260820-001', 'Rp 150.000', 'Toko Sehat Alami'],
    },
  },
  {
    purposeKey: 'FOLLOWUP_PEMBAYARAN_DITERIMA_DIGITAL',
    description: 'Pembayaran diterima (produk digital/e-book)',
    metaParamMap: ['{nama}', '{invoice}', '{perpustakaan_url}', '{nama_toko}'],
    matchDefault: [{ trigger: 'PAYMENT_PAID', orderType: 'DIGITAL' }],
    draft: {
      name: 'hulao_pembayaran_diterima_digital',
      language: LANG,
      category: 'UTILITY',
      bodyText:
        'Halo {{1}}, pembayaran pesanan {{2}} sudah kami terima. Akses produk digitalmu: {{3}}. Simpan pesan ini ya. Terima kasih sudah belanja di {{4}}.',
      bodyExamples: ['Budi', 'INV-20260820-001', 'https://hulao.id/perpustakaan/abc123', 'Toko Sehat Alami'],
    },
  },
  {
    purposeKey: 'FOLLOWUP_PESANAN_DIKIRIM',
    description: 'Pesanan dikirim + resi',
    metaParamMap: ['{nama}', '{invoice}', '{kurir}', '{resi}', '{etd}'],
    matchDefault: [{ trigger: 'SHIPPED' }],
    draft: {
      name: 'hulao_pesanan_dikirim',
      language: LANG,
      category: 'UTILITY',
      bodyText:
        'Halo {{1}}, pesanan {{2}} sudah dikirim via {{3}}, nomor resi {{4}}. Estimasi tiba {{5}} hari. Balas pesan ini kalau paket sudah sampai ya.',
      bodyExamples: ['Budi', 'INV-20260820-001', 'JNE REG', 'JNE1234567890', '2-3'],
    },
  },
  {
    purposeKey: 'FOLLOWUP_KONFIRMASI_SAMPAI',
    description: 'Konfirmasi paket sampai',
    metaParamMap: ['{nama}', '{invoice}', '{link_terima}'],
    matchDefault: [{ trigger: 'DAYS_AFTER_SHIPPED', delayDays: 3 }],
    draft: {
      name: 'hulao_konfirmasi_sampai',
      language: LANG,
      category: 'UTILITY',
      bodyText:
        'Halo {{1}}, pesanan {{2}} seharusnya sudah tiba. Sudah diterima dengan baik? Konfirmasi di sini: {{3}}. Kalau ada kendala, balas pesan ini.',
      bodyExamples: ['Budi', 'INV-20260820-001', 'https://hulao.id/terima/abc123'],
    },
  },
  {
    purposeKey: 'FOLLOWUP_MINTA_ULASAN',
    description: 'Minta ulasan setelah barang diterima',
    metaParamMap: ['{nama}', '{produk}', '{nama_toko}', '{link_review}'],
    matchDefault: [{ trigger: 'DAYS_AFTER_SHIPPED', delayDays: 5 }, { trigger: 'DAYS_AFTER_DELIVERED' }, { trigger: 'COMPLETED' }],
    draft: {
      name: 'hulao_minta_ulasan',
      language: LANG,
      category: 'UTILITY',
      bodyText:
        'Halo {{1}}, terima kasih sudah belanja {{2}} di {{3}}. Boleh minta ulasan singkat pengalamanmu? Klik: {{4}}. Masukanmu sangat berarti untuk kami.',
      bodyExamples: ['Budi', 'Madu Hutan 500ml', 'Toko Sehat Alami', 'https://hulao.id/review/abc123'],
    },
  },
  {
    purposeKey: 'FOLLOWUP_PESANAN_DIBATALKAN',
    description: 'Pesanan dibatalkan',
    metaParamMap: ['{nama}', '{invoice}', '{nama_toko}'],
    matchDefault: [{ trigger: 'CANCELLED' }],
    draft: {
      name: 'hulao_pesanan_dibatalkan',
      language: LANG,
      category: 'UTILITY',
      bodyText:
        'Halo {{1}}, pesanan {{2}} di {{3}} telah dibatalkan. Kalau ini tidak sesuai atau kamu mau order ulang, balas pesan ini ya. Terima kasih.',
      bodyExamples: ['Budi', 'INV-20260820-001', 'Toko Sehat Alami'],
    },
  },
  {
    purposeKey: 'FOLLOWUP_LEAD_LIVE',
    description: 'Nurture lead Live yang belum order (MARKETING — kena opt-out & harga marketing)',
    metaParamMap: ['{nama}', '{produk_minat}', '{nama_toko}', '{link_order}'],
    matchDefault: [{ trigger: 'DAYS_AFTER_LIVE_LEAD' }],
    draft: {
      name: 'hulao_lead_live',
      language: LANG,
      category: 'MARKETING',
      bodyText:
        'Halo {{1}}, kemarin kamu sempat tertarik {{2}} saat live {{3}}. Stoknya masih ada, pesan sekarang lewat {{4}} ya. Balas STOP jika tidak ingin menerima info lagi.',
      bodyExamples: ['Budi', 'Madu Hutan 500ml', 'Toko Sehat Alami', 'https://hulao.id/o/toko-sehat'],
    },
  },
  {
    purposeKey: 'INFO_GENERIC',
    description: 'Informasi umum akun/pesanan (test-send, notifikasi, handoff, kirim manual)',
    metaParamMap: ['{nama}', '{nama_toko}', '{pesan}'],
    draft: {
      name: 'hulao_info_umum',
      language: LANG,
      category: 'UTILITY',
      bodyText:
        'Halo {{1}}, ada informasi terkait akun/pesananmu di {{2}}: {{3}}. Balas pesan ini jika butuh bantuan.',
      bodyExamples: ['Budi', 'Toko Sehat Alami', 'pesanan INV-20260820-001 sedang dikemas dan dikirim besok'],
    },
  },
]

// Template PLATFORM — disubmit di WABA milik hulao (sesi admin) untuk OTP
// login & notifikasi platform.
export const PLATFORM_TEMPLATES: StarterTemplateDef[] = [
  {
    purposeKey: 'AUTH_OTP',
    description: 'Kode OTP login/verifikasi (AUTHENTICATION, tombol salin kode)',
    metaParamMap: ['{kode}'],
    draft: {
      name: 'hulao_otp',
      language: LANG,
      category: 'AUTHENTICATION',
      bodyText: '',
      bodyExamples: [],
      authAddSecurityRecommendation: true,
      authCodeExpirationMinutes: 5,
      buttons: [{ type: 'OTP', otp_type: 'COPY_CODE', text: 'Salin Kode' }],
    },
  },
  {
    purposeKey: 'INFO_GENERIC',
    description: 'Informasi platform ke akun user (UTILITY)',
    metaParamMap: ['{nama}', '{pesan}', '{link}'],
    draft: {
      name: 'hulao_platform_info',
      language: LANG,
      category: 'UTILITY',
      bodyText:
        'Halo {{1}}, ini informasi dari Hulao untuk akunmu: {{2}}. Detail/link: {{3}}. Abaikan pesan ini jika bukan kamu yang meminta.',
      bodyExamples: ['Budi', 'pembayaran paket token kamu sudah kami terima', 'https://hulao.id/billing'],
    },
  },
]

export function findStarterDef(purposeKey: string, pool: StarterTemplateDef[] = STARTER_TEMPLATES) {
  return pool.find((d) => d.purposeKey === purposeKey) ?? null
}

export interface EnsureTemplatesResultItem {
  purposeKey: string
  templateId: string | null
  status: string
  error?: string
}

/**
 * Pastikan template per purposeKey ada di WABA sesi ini: buat draft bila
 * belum ada (by wabaId+purposeKey, fallback by nama+bahasa dari sync) lalu
 * submit. Idempoten: PENDING/APPROVED dilewati; DRAFT/REJECTED disubmit ulang.
 */
export async function ensureTemplatesByPurpose(input: {
  sessionId: string
  userId: string
  keys?: string[]
  pool?: StarterTemplateDef[]
}): Promise<{ ok: boolean; error?: string; results: EnsureTemplatesResultItem[] }> {
  const pool = input.pool ?? STARTER_TEMPLATES
  const defs = input.keys ? pool.filter((d) => input.keys!.includes(d.purposeKey)) : pool
  const results: EnsureTemplatesResultItem[] = []

  const session = await prisma.whatsappSession.findFirst({
    where: { id: input.sessionId, userId: input.userId, provider: 'CLOUD_API' },
    select: { id: true, wabaId: true },
  })
  if (!session?.wabaId) return { ok: false, error: 'Sesi Cloud API tidak ditemukan', results }
  const wabaId = session.wabaId

  for (const def of defs) {
    try {
      let tpl = await prisma.wabaTemplate.findFirst({
        where: { wabaId, purposeKey: def.purposeKey, status: { not: 'DELETED' } },
        orderBy: { updatedAt: 'desc' },
      })
      // Template dengan nama sama sudah ada (hasil sync / dibuat manual) →
      // klaim purposeKey-nya daripada membuat duplikat (nama unik di Meta).
      if (!tpl) {
        const byName = await prisma.wabaTemplate.findUnique({
          where: { wabaId_name_language: { wabaId, name: def.draft.name, language: def.draft.language } },
        })
        if (byName && byName.status !== 'DELETED') {
          tpl = await prisma.wabaTemplate.update({
            where: { id: byName.id },
            data: { purposeKey: def.purposeKey },
          })
        }
      }
      if (!tpl) {
        const created = await createTemplateDraft({
          userId: input.userId,
          sessionId: input.sessionId,
          draft: def.draft,
          purposeKey: def.purposeKey,
        })
        if (!created.ok || !created.template) {
          results.push({ purposeKey: def.purposeKey, templateId: null, status: 'ERROR', error: created.error })
          continue
        }
        tpl = created.template
      }

      if (tpl.status === 'DRAFT' || tpl.status === 'REJECTED') {
        const sub = await submitTemplate(tpl.id, input.userId)
        results.push({
          purposeKey: def.purposeKey,
          templateId: tpl.id,
          status: sub.ok && sub.template ? sub.template.status : tpl.status,
          ...(sub.ok ? {} : { error: sub.error }),
        })
      } else {
        results.push({ purposeKey: def.purposeKey, templateId: tpl.id, status: tpl.status })
      }
    } catch (err) {
      results.push({ purposeKey: def.purposeKey, templateId: null, status: 'ERROR', error: (err as Error).message })
    }
  }
  return { ok: true, results }
}

/** Status starter pack untuk satu WABA (UI panel). */
export async function getStarterPackStatus(wabaId: string, pool: StarterTemplateDef[] = STARTER_TEMPLATES) {
  const keys = pool.map((d) => d.purposeKey)
  const rows = await prisma.wabaTemplate.findMany({
    where: { wabaId, purposeKey: { in: keys }, status: { not: 'DELETED' } },
    select: { id: true, purposeKey: true, status: true, name: true, rejectionReason: true, category: true },
    orderBy: { updatedAt: 'desc' },
  })
  const byKey = new Map(rows.map((r) => [r.purposeKey, r]))
  return pool.map((d) => {
    const row = byKey.get(d.purposeKey)
    return {
      purposeKey: d.purposeKey,
      description: d.description,
      name: d.draft.name,
      category: d.draft.category,
      templateId: row?.id ?? null,
      status: row?.status ?? null,
      rejectionReason: row?.rejectionReason ?? null,
    }
  })
}

/**
 * Auto-link template Meta bawaan ke FollowUpTemplate default user yang cocok
 * (trigger + paymentMethod + orderType + delayDays). Dipanggil setelah
 * ensureTemplatesByPurpose supaya follow-up otomatis pakai template Meta di
 * sesi Cloud API. Hanya mengisi yang belum punya metaTemplateId.
 */
export async function autoLinkStarterFollowUps(input: {
  userId: string
  wabaId: string
}): Promise<{ linked: number }> {
  const defs = STARTER_TEMPLATES.filter((d) => d.matchDefault?.length)
  const templates = await prisma.wabaTemplate.findMany({
    where: { wabaId: input.wabaId, purposeKey: { in: defs.map((d) => d.purposeKey) }, status: { not: 'DELETED' } },
    select: { id: true, purposeKey: true },
  })
  const byPurpose = new Map(templates.map((t) => [t.purposeKey, t.id]))

  let linked = 0
  for (const def of defs) {
    const metaTemplateId = byPurpose.get(def.purposeKey)
    if (!metaTemplateId) continue
    for (const match of def.matchDefault ?? []) {
      const where: Record<string, unknown> = {
        userId: input.userId,
        isDefault: true,
        trigger: match.trigger,
        metaTemplateId: null,
      }
      if (match.paymentMethod !== undefined) where.paymentMethod = match.paymentMethod
      if (match.orderType !== undefined) where.orderType = match.orderType
      if (match.delayDays !== undefined) where.delayDays = match.delayDays
      const r = await prisma.followUpTemplate.updateMany({
        where: where as never,
        data: { metaTemplateId, metaParamMap: def.metaParamMap },
      })
      linked += r.count
    }
  }
  return { linked }
}
