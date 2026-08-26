// POST /api/v1/messages/template — kirim TEMPLATE Meta yang sudah disetujui
// (untuk di luar window 24 jam). Segmen statis "template" menang atas dinamis
// [externalMsgId] di Next, jadi tidak bentrok dengan .../[externalMsgId]/status.
import {
  apiV1Error,
  apiV1Ok,
  checkSendRateLimit,
  getIdempotent,
  readIdempotencyKey,
  requirePublicApiAuth,
  saveIdempotent,
} from '@/lib/public-api-auth'
import { sendPublicTemplate } from '@/lib/services/public-api/send-message'
import { normalizeMsisdn, publicSendTemplateSchema } from '@/lib/validations/public-message'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const gate = await requirePublicApiAuth(req)
  if (!gate.ok) return gate.response

  const sendLimited = checkSendRateLimit(gate.auth)
  if (sendLimited) return sendLimited

  const idemKey = readIdempotencyKey(req)
  if (idemKey) {
    const cached = getIdempotent(gate.auth.keyId, idemKey)
    if (cached) return apiV1Ok(cached.body, gate.auth, cached.status)
  }

  const body = await req.json().catch(() => null)
  const parsed = publicSendTemplateSchema.safeParse(body)
  if (!parsed.success) {
    return apiV1Error(
      'invalid_body',
      parsed.error.issues[0]?.message ?? 'Data tidak valid.',
      400,
      gate.auth.rateLimitHeaders,
    )
  }

  try {
    const out = await sendPublicTemplate({
      userId: gate.auth.userId,
      to: normalizeMsisdn(parsed.data.phone_number),
      templateId: parsed.data.template_id,
      templateName: parsed.data.template_name,
      params: parsed.data.params,
      sessionId: parsed.data.session_id,
    })
    if (!out.ok) {
      return apiV1Error(out.code ?? 'send_failed', out.error ?? 'Gagal mengirim.', out.httpStatus, gate.auth.rateLimitHeaders)
    }
    if (idemKey) saveIdempotent(gate.auth.keyId, idemKey, 200, out.data)
    return apiV1Ok(out.data, gate.auth)
  } catch (err) {
    console.error('[api/v1/messages/template POST] gagal:', err)
    return apiV1Error('server_error', 'Gagal mengirim template.', 500, gate.auth.rateLimitHeaders)
  }
}
