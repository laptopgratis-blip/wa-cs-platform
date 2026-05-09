'use client'

import { ArrowLeft, Award, Printer } from 'lucide-react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'

interface Cert {
  number: string
  studentName: string
  courseTitle: string
  courseSlug: string
  issuerName: string
  issuedAt: string
}

export function CertificatePrintable({ cert }: { cert: Cert }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 print:p-0">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link
          href="/belajar"
          className="inline-flex items-center gap-1 text-xs text-warm-500 hover:text-warm-700"
        >
          <ArrowLeft className="size-3" />
          Dashboard
        </Link>
        <Button
          onClick={() => window.print()}
          variant="outline"
          size="sm"
        >
          <Printer className="mr-2 size-4" />
          Cetak / Save PDF
        </Button>
      </div>

      {/* Certificate canvas — A4 landscape ratio, designed for print */}
      <div
        className="relative mx-auto aspect-[1.414/1] w-full max-w-[800px] rounded-2xl border-4 border-amber-400 bg-gradient-to-br from-amber-50 via-white to-amber-50 p-8 shadow-lg print:rounded-none print:border-2 print:shadow-none sm:p-12"
        id="certificate-canvas"
      >
        <div className="flex h-full flex-col items-center justify-between text-center">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-amber-200 px-4 py-1 text-xs font-bold uppercase tracking-widest text-amber-900">
              <Award className="size-3.5" />
              Certificate of Completion
            </div>
            <h1 className="font-display text-3xl font-extrabold text-amber-900 sm:text-4xl">
              SERTIFIKAT
            </h1>
          </div>

          <div className="space-y-3">
            <p className="text-sm text-amber-800">Diberikan kepada</p>
            <h2 className="font-display text-3xl font-bold text-warm-900 sm:text-4xl">
              {cert.studentName}
            </h2>
            <p className="text-sm text-amber-800">
              atas keberhasilan menyelesaikan course
            </p>
            <h3 className="font-display text-xl font-bold text-amber-900 sm:text-2xl">
              "{cert.courseTitle}"
            </h3>
          </div>

          <div className="grid w-full grid-cols-3 items-end gap-4 text-xs text-warm-700">
            <div className="text-left">
              <div className="font-semibold uppercase tracking-wide text-amber-700">
                Tanggal
              </div>
              <div className="mt-1 font-mono">
                {new Date(cert.issuedAt).toLocaleDateString('id-ID', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </div>
            </div>
            <div className="text-center">
              <div className="font-display text-base italic text-amber-900">
                {cert.issuerName}
              </div>
              <div className="mt-1 border-t border-amber-300 pt-1 text-[10px] uppercase tracking-wide text-amber-700">
                Creator
              </div>
            </div>
            <div className="text-right">
              <div className="font-semibold uppercase tracking-wide text-amber-700">
                Nomor Sertifikat
              </div>
              <div className="mt-1 font-mono text-[10px]">{cert.number}</div>
            </div>
          </div>
        </div>

        {/* Decorative corner frames */}
        <div className="absolute left-2 top-2 size-8 border-l-2 border-t-2 border-amber-400 print:size-6" />
        <div className="absolute right-2 top-2 size-8 border-r-2 border-t-2 border-amber-400 print:size-6" />
        <div className="absolute bottom-2 left-2 size-8 border-b-2 border-l-2 border-amber-400 print:size-6" />
        <div className="absolute bottom-2 right-2 size-8 border-b-2 border-r-2 border-amber-400 print:size-6" />
      </div>

      <div className="mt-4 text-center text-xs text-warm-500 print:hidden">
        Verify keaslian sertifikat di hulao.id/belajar/certificate/
        {cert.number}
      </div>
    </div>
  )
}
