// Flow engine — dipanggil internal API saat wa-service handle pesan masuk.
// Job-nya:
//   1. Cek apakah kontak ini sedang dalam OrderSession ACTIVE.
//   2. Kalau ada → process step (validate input, save, advance, atau complete).
//   3. Kalau tidak ada → coba detect flow dari triggerKeywords. Match → start.
//   4. Tidak match → return null (signal: caller lanjut ke AI normal).
//
// Pesan reply yang dikembalikan disubstitusi placeholder `{fieldName}` dari
// collectedData (+ {bankInfo} kalau finalAction punya bankInfo).
//
// Auto-abandon lazy: kalau lastActivityAt > 30 menit → mark ABANDONED dan
// perlakukan sebagai "no active session" supaya keyword detection bisa start
// flow baru.
import { prisma } from '@/lib/prisma'
import {
  type SalesFlowFinalActionInput,
  type SalesFlowStepInput,
} from '@/lib/validations/sales-flow'

const ABANDON_AFTER_MS = 30 * 60 * 1000 // 30 menit

// Kata kunci pembatal — case-insensitive substring di pesan customer.
const CANCEL_KEYWORDS = [
  'batal',
  'gajadi',
  'ga jadi',
  'tidak jadi',
  'cancel',
  'cancelled',
  'gak jadi',
]

// Kata afirmatif untuk validasi yes_no.
const YES_KEYWORDS = [
  'ya',
  'iya',
  'iyaa',
  'iyaaa',
  'yes',
  'oke',
  'ok',
  'okay',
  'okeh',
  'siap',
  'lanjut',
  'lanjutkan',
  'setuju',
  'sip',
  'mau',
  'sudah',
  'udah',
]

const NO_KEYWORDS = ['tidak', 'no', 'nggak', 'enggak', 'gak', 'ga']

export interface FlowProcessResult {
  // true = caller (wa-service) harus kirim `reply` dan SKIP AI generation.
  // false = caller lanjut ke AI normal (no flow active, no flow detected).
  handled: boolean
  reply?: string
  // Kalau diisi, wa-service kirim notifikasi tambahan ke admin (lewat session
  // WA yang sama). Hanya di-set saat flow selesai dan finalAction.notifyAdmin
  // = true + adminPhone valid.
  notifyAdmin?: { phoneNumber: string; message: string }
  // Untuk debugging/log saja — caller boleh ignore.
  meta?: {
    flowId?: string
    flowName?: string
    sessionId?: string // OrderSession.id
    status?: 'started' | 'continued' | 'completed' | 'abandoned' | 'cancelled'
  }
}

interface FlowProcessInput {
  userId: string
  contactId: string
  // Pesan customer (raw, kita lower-case di internal logic).
  message: string
}

// Public entry-point.
export async function processFlowMessage(
  input: FlowProcessInput,
): Promise<FlowProcessResult> {
  const { userId, contactId, message } = input
  const msg = message.trim()
  if (!msg) return { handled: false }

  // 1. Cari OrderSession ACTIVE untuk kontak ini.
  const active = await getActiveSession(contactId)
  if (active) {
    return processActiveStep(active, msg)
  }

  // 2. Belum ada flow aktif — coba detect dari pesan.
  return detectAndStart({ userId, contactId, message: msg })
}

// ── ACTIVE SESSION HANDLER ─────────────────────────────────────────────────

interface ActiveSessionWithFlow {
  id: string
  userId: string
  contactId: string
  currentStep: number
  collectedData: Record<string, string>
  lastActivityAt: Date
  flow: {
    id: string
    name: string
    steps: SalesFlowStepInput[]
    finalAction: SalesFlowFinalActionInput
    isActive: boolean
  }
}

async function getActiveSession(
  contactId: string,
): Promise<ActiveSessionWithFlow | null> {
  const row = await prisma.orderSession.findFirst({
    where: { contactId, status: 'ACTIVE' },
    orderBy: { startedAt: 'desc' },
    select: {
      id: true,
      userId: true,
      contactId: true,
      currentStep: true,
      collectedData: true,
      lastActivityAt: true,
      flow: {
        select: {
          id: true,
          name: true,
          steps: true,
          finalAction: true,
          isActive: true,
        },
      },
    },
  })
  if (!row) return null

  // Lazy abandon kalau idle > 30 menit. Setelah ini, kita anggap tidak ada
  // session aktif — caller bisa coba detect flow baru.
  const idleMs = Date.now() - row.lastActivityAt.getTime()
  if (idleMs > ABANDON_AFTER_MS) {
    await prisma.orderSession.update({
      where: { id: row.id },
      data: { status: 'ABANDONED' },
    })
    return null
  }

  return {
    id: row.id,
    userId: row.userId,
    contactId: row.contactId,
    currentStep: row.currentStep,
    collectedData: (row.collectedData as Record<string, string>) ?? {},
    lastActivityAt: row.lastActivityAt,
    flow: {
      id: row.flow.id,
      name: row.flow.name,
      steps: (row.flow.steps as unknown as SalesFlowStepInput[]) ?? [],
      finalAction:
        (row.flow.finalAction as unknown as SalesFlowFinalActionInput) ?? {
          notifyAdmin: false,
          adminPhone: '',
          replyMessage: 'Terima kasih ya kak!',
        },
      isActive: row.flow.isActive,
    },
  }
}

async function processActiveStep(
  session: ActiveSessionWithFlow,
  message: string,
): Promise<FlowProcessResult> {
  // Pembatalan eksplisit — abort dengan ramah.
  if (matchesCancelKeyword(message)) {
    await prisma.orderSession.update({
      where: { id: session.id },
      data: { status: 'CANCELLED', completedAt: new Date() },
    })
    return {
      handled: true,
      reply: 'Baik kak, dibatalkan ya. Kalau berubah pikiran, tinggal chat lagi 😊',
      meta: {
        flowId: session.flow.id,
        flowName: session.flow.name,
        sessionId: session.id,
        status: 'cancelled',
      },
    }
  }

  // Flow di-set non-aktif user di tengah jalan — finish gracefully.
  if (!session.flow.isActive) {
    await prisma.orderSession.update({
      where: { id: session.id },
      data: { status: 'ABANDONED' },
    })
    return { handled: false }
  }

  const steps = session.flow.steps
  const idx = session.currentStep
  if (idx < 0 || idx >= steps.length) {
    // State tidak valid — recover dengan menutup session, biarkan AI lanjut.
    await prisma.orderSession.update({
      where: { id: session.id },
      data: { status: 'FAILED', completedAt: new Date() },
    })
    return { handled: false }
  }

  const step = steps[idx]!
  const validation = validateStep(step.validation, message)
  if (!validation.ok) {
    // Update lastActivity supaya tidak abandon, lalu re-ask dengan hint.
    await prisma.orderSession.update({
      where: { id: session.id },
      data: { lastActivityAt: new Date() },
    })
    return {
      handled: true,
      reply: `${validation.hint}\n\n${renderTemplate(step.question, session.collectedData, session.flow.finalAction)}`,
      meta: {
        flowId: session.flow.id,
        flowName: session.flow.name,
        sessionId: session.id,
        status: 'continued',
      },
    }
  }

  // Yes/No: kalau "no" pada konfirmasi akhir, perlakukan seperti cancel.
  if (step.validation === 'yes_no' && validation.value === 'no') {
    await prisma.orderSession.update({
      where: { id: session.id },
      data: { status: 'CANCELLED', completedAt: new Date() },
    })
    return {
      handled: true,
      reply: 'Oke kak, dibatalkan ya. Kalau ada yang berubah, tinggal chat lagi 😊',
      meta: {
        flowId: session.flow.id,
        flowName: session.flow.name,
        sessionId: session.id,
        status: 'cancelled',
      },
    }
  }

  // Save jawaban & advance.
  const nextData = {
    ...session.collectedData,
    [step.fieldName]: validation.value ?? message,
  }
  const nextIdx = idx + 1

  if (nextIdx >= steps.length) {
    // Selesai — mark COMPLETED + auto-create UserOrder + render replyMessage.
    // Pakai transaction supaya kalau create order gagal, status session
    // tetap COMPLETED tapi error tercatat di log (manual recovery).
    await prisma.orderSession.update({
      where: { id: session.id },
      data: {
        currentStep: nextIdx,
        collectedData: nextData,
        status: 'COMPLETED',
        completedAt: new Date(),
        lastActivityAt: new Date(),
      },
    })

    // Best-effort create order — kalau gagal (mis. duplicate orderSessionId
    // dari race), tetap kembalikan reply ke customer.
    await createOrderFromCompletedSession(session, nextData).catch((err) =>
      console.error('[flow-engine] createOrderFromCompletedSession gagal:', err),
    )

    const finalReply = renderTemplate(
      session.flow.finalAction.replyMessage,
      nextData,
      session.flow.finalAction,
    )

    const adminMsg = buildAdminNotification(
      session.flow.name,
      session.flow.finalAction,
      nextData,
    )

    return {
      handled: true,
      reply: finalReply,
      notifyAdmin: adminMsg,
      meta: {
        flowId: session.flow.id,
        flowName: session.flow.name,
        sessionId: session.id,
        status: 'completed',
      },
    }
  }

  // Belum selesai — kirim pertanyaan berikutnya.
  await prisma.orderSession.update({
    where: { id: session.id },
    data: {
      currentStep: nextIdx,
      collectedData: nextData,
      lastActivityAt: new Date(),
    },
  })

  const nextStep = steps[nextIdx]!
  return {
    handled: true,
    reply: renderTemplate(
      nextStep.question,
      nextData,
      session.flow.finalAction,
    ),
    meta: {
      flowId: session.flow.id,
      flowName: session.flow.name,
      sessionId: session.id,
      status: 'continued',
    },
  }
}

// ── FLOW DETECTION ─────────────────────────────────────────────────────────

async function detectAndStart(input: {
  userId: string
  contactId: string
  message: string
}): Promise<FlowProcessResult> {
  const msgLower = input.message.toLowerCase()

  const flows = await prisma.userSalesFlow.findMany({
    where: { userId: input.userId, isActive: true },
    orderBy: [{ createdAt: 'asc' }],
    select: {
      id: true,
      name: true,
      triggerKeywords: true,
      steps: true,
      finalAction: true,
    },
  })

  const matched = flows.find((f) =>
    f.triggerKeywords.some((kw) => msgLower.includes(kw.toLowerCase())),
  )
  if (!matched) return { handled: false }

  const steps = (matched.steps as unknown as SalesFlowStepInput[]) ?? []
  const finalAction =
    (matched.finalAction as unknown as SalesFlowFinalActionInput) ?? {
      notifyAdmin: false,
      adminPhone: '',
      replyMessage: 'Terima kasih ya kak!',
    }

  // Edge: flow tanpa step → langsung "selesai" (cuma kirim replyMessage).
  if (steps.length === 0) {
    return {
      handled: true,
      reply: renderTemplate(finalAction.replyMessage, {}, finalAction),
      meta: { flowId: matched.id, flowName: matched.name, status: 'completed' },
    }
  }

  // Buat OrderSession baru, kirim pertanyaan pertama.
  const created = await prisma.orderSession.create({
    data: {
      userId: input.userId,
      contactId: input.contactId,
      flowId: matched.id,
      currentStep: 0,
      collectedData: {},
      status: 'ACTIVE',
    },
    select: { id: true },
  })

  const firstStep = steps[0]!
  return {
    handled: true,
    reply: renderTemplate(firstStep.question, {}, finalAction),
    meta: {
      flowId: matched.id,
      flowName: matched.name,
      sessionId: created.id,
      status: 'started',
    },
  }
}

// ── VALIDATION HELPERS ─────────────────────────────────────────────────────

interface ValidationResult {
  ok: boolean
  // Nilai yang akan disimpan ke collectedData (boleh transformasi, mis.
  // 'yes_no' di-normalisasi ke 'yes' / 'no').
  value?: string
  hint?: string
}

function validateStep(
  rule: SalesFlowStepInput['validation'],
  raw: string,
): ValidationResult {
  const v = raw.trim()
  if (!rule) return { ok: true, value: v }

  if (rule.startsWith('min_words:')) {
    const n = Number(rule.split(':')[1] ?? '2')
    const words = v.split(/\s+/).filter(Boolean)
    if (words.length < n) {
      return {
        ok: false,
        hint:
          n === 2
            ? 'Mohon tuliskan nama lengkap (depan + belakang) ya kak.'
            : `Mohon tulis lebih jelas (minimal ${n} kata) ya kak.`,
      }
    }
    return { ok: true, value: v }
  }

  if (rule === 'phone') {
    // Ambil hanya digit + sanity check panjang.
    const digits = v.replace(/[^\d]/g, '')
    if (digits.length < 8 || digits.length > 15) {
      return {
        ok: false,
        hint: 'Nomor HP-nya kurang lengkap, coba kirim ulang ya kak.',
      }
    }
    return { ok: true, value: digits }
  }

  if (rule === 'address') {
    if (v.length < 15) {
      return {
        ok: false,
        hint: 'Alamatnya masih kurang lengkap. Mohon sertakan kelurahan, kecamatan, kota, kode pos ya kak.',
      }
    }
    return { ok: true, value: v }
  }

  if (rule === 'yes_no') {
    const lower = v.toLowerCase()
    if (YES_KEYWORDS.some((k) => lower.includes(k))) {
      return { ok: true, value: 'yes' }
    }
    if (NO_KEYWORDS.some((k) => lower === k || lower.startsWith(k + ' '))) {
      return { ok: true, value: 'no' }
    }
    return {
      ok: false,
      hint: 'Mohon balas dengan "ya" atau "tidak" ya kak.',
    }
  }

  return { ok: true, value: v }
}

function matchesCancelKeyword(message: string): boolean {
  const lower = message.toLowerCase()
  return CANCEL_KEYWORDS.some((k) => lower.includes(k))
}

// ── TEMPLATE SUBSTITUTION ──────────────────────────────────────────────────

// Replace {fieldName} di teks. Field yang tidak ada di data dibiarkan apa
// adanya supaya kalau ada typo placeholder, terlihat (bukan kosong silent).
// Special: {bankInfo} → render dari finalAction.bankInfo (kalau ada).
function renderTemplate(
  template: string,
  data: Record<string, string>,
  finalAction: SalesFlowFinalActionInput,
): string {
  let out = template
  // {bankInfo} multi-line block.
  if (out.includes('{bankInfo}')) {
    const bi = finalAction.bankInfo
    const block = bi
      ? `Bank: ${bi.bankName || '-'}\nNo. Rek: ${bi.accountNumber || '-'}\na.n. ${bi.accountName || '-'}`
      : '(rekening belum diisi)'
    out = out.replace(/\{bankInfo\}/g, block)
  }
  out = out.replace(/\{(\w+)\}/g, (full, key) => {
    return Object.prototype.hasOwnProperty.call(data, key) ? data[key] ?? '' : full
  })
  return out
}

// ── ORDER CREATION ─────────────────────────────────────────────────────────

// Map flow.template → paymentMethod yang dipakai di UserOrder.
// CUSTOM = FREE (default; user bisa edit manual via UI).
function paymentMethodFromFlow(template: string): string {
  switch (template) {
    case 'COD':
      return 'COD'
    case 'TRANSFER':
      return 'TRANSFER'
    case 'BOOKING':
      return 'BOOKING'
    case 'CONSULTATION':
      return 'CONSULTATION'
    default:
      return 'FREE'
  }
}

// Auto-create UserOrder dari session yang baru selesai. Field customerName/
// Phone/Address di-extract dari collectedData kalau ada — selain itu fallback
// ke phoneNumber kontak (dari prisma.contact).
async function createOrderFromCompletedSession(
  session: ActiveSessionWithFlow,
  collectedData: Record<string, string>,
): Promise<void> {
  // Idempotent guard: kalau order sudah ada untuk session ini (jarang, tapi
  // mungkin saat retry), jangan duplikasi.
  const existing = await prisma.userOrder.findUnique({
    where: { orderSessionId: session.id },
    select: { id: true },
  })
  if (existing) return

  // Resolve flow.template untuk paymentMethod.
  const flow = await prisma.userSalesFlow.findUnique({
    where: { id: session.flow.id },
    select: { template: true, name: true },
  })
  if (!flow) return

  // Resolve contact.phoneNumber sebagai fallback kalau customerPhone tidak
  // ditangkap di salah satu step.
  const contact = await prisma.contact.findUnique({
    where: { id: session.contactId },
    select: { phoneNumber: true, name: true },
  })

  const customerName =
    collectedData.customerName ?? contact?.name ?? 'Tanpa Nama'
  const customerPhone =
    collectedData.customerPhone ?? contact?.phoneNumber ?? ''
  const customerAddress = collectedData.customerAddress ?? null

  // Notes: simpan field tambahan yang tidak masuk slot utama (mis.
  // bookingDateTime, consultationTopic) supaya tidak hilang.
  const handledKeys = new Set([
    'customerName',
    'customerPhone',
    'customerAddress',
    'orderConfirmation',
    'bankPaymentNotice',
  ])
  const extraEntries = Object.entries(collectedData).filter(
    ([k]) => !handledKeys.has(k),
  )
  const notes =
    extraEntries.length > 0
      ? extraEntries.map(([k, v]) => `${k}: ${v}`).join('\n')
      : null

  await prisma.userOrder.create({
    data: {
      userId: session.userId,
      contactId: session.contactId,
      orderSessionId: session.id,
      customerName,
      customerPhone,
      customerAddress,
      paymentMethod: paymentMethodFromFlow(flow.template),
      paymentStatus: 'PENDING',
      deliveryStatus: 'PENDING',
      flowName: flow.name,
      notes,
    },
  })
}

// ── ADMIN NOTIFICATION ─────────────────────────────────────────────────────

function buildAdminNotification(
  flowName: string,
  finalAction: SalesFlowFinalActionInput,
  data: Record<string, string>,
): { phoneNumber: string; message: string } | undefined {
  if (!finalAction.notifyAdmin) return undefined
  const phone = sanitizePhone(finalAction.adminPhone)
  if (!phone) return undefined

  const lines: string[] = [
    `🆕 Pesanan baru — ${flowName}`,
    '',
  ]
  for (const [k, v] of Object.entries(data)) {
    lines.push(`• ${k}: ${v}`)
  }
  return { phoneNumber: phone, message: lines.join('\n') }
}

function sanitizePhone(raw: string): string {
  if (!raw) return ''
  const digits = raw.replace(/[^\d]/g, '')
  if (digits.length < 8 || digits.length > 15) return ''
  // Normalisasi awalan: 08xx → 628xx supaya kompatibel dengan Baileys JID.
  if (digits.startsWith('0')) return '62' + digits.slice(1)
  return digits
}
