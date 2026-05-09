// GET /api/lms/certificates/[number]
// Public verify endpoint — no auth. Return cert info kalau exists,
// 404 kalau tidak. Dipakai di /belajar/certificate/[number].
import { jsonError, jsonOk } from '@/lib/api'
import { getCertificateByNumber } from '@/lib/services/lms/certificate'

interface Params {
  params: Promise<{ number: string }>
}

export async function GET(_req: Request, { params }: Params) {
  const { number } = await params
  const cert = await getCertificateByNumber(number)
  if (!cert) return jsonError('Sertifikat tidak ditemukan', 404)
  return jsonOk({
    certificate: {
      ...cert,
      issuedAt: cert.issuedAt.toISOString(),
    },
  })
}
