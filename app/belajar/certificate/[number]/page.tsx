// /belajar/certificate/[number] — public certificate verification page.
// Display sertifikat HTML (printable). User bisa save PDF via browser
// print dialog (Phase 4 — Phase 5 bisa upgrade ke real PDF lib).
import { notFound } from 'next/navigation'

import { CertificatePrintable } from '@/components/belajar/CertificatePrintable'
import { getCertificateByNumber } from '@/lib/services/lms/certificate'

interface Params {
  params: Promise<{ number: string }>
}

export const dynamic = 'force-dynamic'

export default async function CertificatePage({ params }: Params) {
  const { number } = await params
  const cert = await getCertificateByNumber(number)
  if (!cert) notFound()
  return (
    <CertificatePrintable
      cert={{
        number: cert.number,
        studentName: cert.studentName,
        courseTitle: cert.courseTitle,
        courseSlug: cert.courseSlug,
        issuerName: cert.issuerName,
        issuedAt: cert.issuedAt.toISOString(),
      }}
    />
  )
}
