// Dokumentasi API inline (server component). Sengaja tidak memakai file
// markdown eksternal supaya base URL & angka kuota selalu ikut kode yang
// benar-benar jalan.
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { RATE_LIMIT_PER_KEY } from '@/lib/public-api-auth'
import { MAX_ACTIVE_KEYS_PER_USER } from '@/lib/validations/seller-api-key'

interface ApiDocsSectionProps {
  baseUrl: string
}

function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg bg-warm-900 p-3 text-xs leading-relaxed text-warm-50 dark:bg-warm-950">
      <code>{children}</code>
    </pre>
  )
}

function Endpoint({ method, path, desc }: { method: string; path: string; desc: string }) {
  return (
    <div className="flex flex-col gap-1 border-b border-warm-200 py-3 last:border-0 dark:border-warm-700">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-mono text-[11px] font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
          {method}
        </span>
        <code className="font-mono text-xs text-warm-800 dark:text-warm-200">{path}</code>
      </div>
      <p className="text-sm text-warm-500">{desc}</p>
    </div>
  )
}

const ERRORS: Array<{ http: string; code: string; act: string }> = [
  { http: '401', code: 'missing_token', act: 'Header Authorization belum dikirim.' },
  { http: '401', code: 'invalid_token', act: 'Kunci salah ketik atau sudah dihapus. Buat kunci baru.' },
  { http: '401', code: 'key_revoked', act: 'Kunci dicabut dari dashboard. Pakai kunci lain.' },
  { http: '401', code: 'key_expired', act: 'Masa berlaku habis. Buat kunci baru.' },
  { http: '404', code: 'not_found', act: 'Data tidak ada, atau bukan milik akun pemilik kunci.' },
  { http: '400', code: 'invalid_query', act: 'Periksa parameter di pesan error.' },
  {
    http: '400',
    code: 'invalid_cursor',
    act: 'Cursor sudah tidak berlaku (datanya terhapus). Ulangi dari halaman pertama.',
  },
  { http: '429', code: 'rate_limited', act: 'Tunggu sesuai header Retry-After lalu ulangi.' },
  { http: '500', code: 'server_error', act: 'Kesalahan di sisi kami — ulangi beberapa saat lagi.' },
]

export function ApiDocsSection({ baseUrl }: ApiDocsSectionProps) {
  return (
    <Card className="rounded-xl border-warm-200">
      <CardContent className="pt-6">
        <h2 className="mb-4 font-display text-lg font-bold text-warm-900 dark:text-warm-50">
          Dokumentasi API
        </h2>

        <Tabs defaultValue="mulai">
          <TabsList className="flex w-full flex-wrap justify-start">
            <TabsTrigger value="mulai">Mulai Cepat</TabsTrigger>
            <TabsTrigger value="endpoint">Endpoint</TabsTrigger>
            <TabsTrigger value="error">Kode Error</TabsTrigger>
            <TabsTrigger value="kuota">Batas &amp; Kuota</TabsTrigger>
            <TabsTrigger value="segera">Segera Hadir</TabsTrigger>
          </TabsList>

          <TabsContent value="mulai" className="space-y-3 pt-4">
            <p className="text-sm text-warm-600 dark:text-warm-300">
              Semua endpoint memakai base URL{' '}
              <code className="font-mono text-xs">{baseUrl}/api/v1</code> dan autentikasi lewat
              header <code className="font-mono text-xs">Authorization: Bearer</code>. Kunci tidak
              boleh dikirim lewat query string — nilainya akan tercatat di log server dan riwayat
              browser.
            </p>
            <Code>{`curl ${baseUrl}/api/v1/ping \\
  -H "Authorization: Bearer hl_live_xxxxxxxxxxxxxxxx"`}</Code>
            <p className="text-sm text-warm-600 dark:text-warm-300">Respons sukses:</p>
            <Code>{`{
  "success": true,
  "data": { "pong": true, "keyName": "n8n produksi", "apiVersion": "v1" }
}`}</Code>
            <p className="text-sm text-warm-600 dark:text-warm-300">
              Respons gagal selalu berbentuk{' '}
              <code className="font-mono text-xs">
                {'{ "success": false, "error": "...", "code": "..." }'}
              </code>{' '}
              — pakai <code className="font-mono text-xs">code</code> untuk logika program, bukan
              teks <code className="font-mono text-xs">error</code> yang bisa berubah.
            </p>
          </TabsContent>

          <TabsContent value="endpoint" className="pt-4">
            <Endpoint method="GET" path="/api/v1/ping" desc="Uji kunci API. Balikannya menyebut nama kunci yang dipakai." />
            <Endpoint
              method="GET"
              path="/api/v1/contacts?stage=&tag=&search=&limit=&cursor="
              desc="Daftar kontak. limit 1–100 (default 25). Lanjut halaman dengan nextCursor dari respons sebelumnya."
            />
            <Endpoint method="GET" path="/api/v1/contacts/{id}" desc="Detail satu kontak beserta jumlah pesannya." />
            <Endpoint
              method="GET"
              path="/api/v1/messages?contactId=&limit=&cursor="
              desc="Riwayat pesan satu kontak, terbaru dulu. contactId wajib."
            />
            <Endpoint
              method="GET"
              path="/api/v1/messages/{externalMsgId}/status"
              desc="Status kirim (SENT/DELIVERED/READ/FAILED) + biaya Kredit Pesan untuk pesan itu."
            />
            <Endpoint
              method="GET"
              path="/api/v1/balance"
              desc="Saldo token AI, saldo Kredit Pesan WA (Rp), dan tarif per kategori template."
            />
            <Endpoint
              method="GET"
              path="/api/v1/senders"
              desc="Nomor WhatsApp terhubung milikmu, urut sesuai prioritas pemakaian platform."
            />
            <div className="mt-4 space-y-2">
              <p className="text-sm font-medium text-warm-800 dark:text-warm-200">
                Contoh pagination
              </p>
              <Code>{`# halaman pertama
curl "${baseUrl}/api/v1/contacts?limit=50" -H "Authorization: Bearer \$KEY"

# halaman berikutnya — pakai nextCursor dari respons sebelumnya
curl "${baseUrl}/api/v1/contacts?limit=50&cursor=ckxyz..." -H "Authorization: Bearer \$KEY"`}</Code>
              <p className="text-xs text-warm-500">
                <code className="font-mono">nextCursor</code> bernilai{' '}
                <code className="font-mono">null</code> saat sudah halaman terakhir.
              </p>
            </div>
          </TabsContent>

          <TabsContent value="error" className="pt-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-warm-200 text-left text-xs uppercase tracking-wide text-warm-500 dark:border-warm-700">
                    <th className="py-2 pr-4 font-medium">HTTP</th>
                    <th className="py-2 pr-4 font-medium">code</th>
                    <th className="py-2 font-medium">Yang perlu dilakukan</th>
                  </tr>
                </thead>
                <tbody>
                  {ERRORS.map((e) => (
                    <tr key={e.code} className="border-b border-warm-100 last:border-0 dark:border-warm-800">
                      <td className="py-2 pr-4 font-mono text-xs">{e.http}</td>
                      <td className="py-2 pr-4 font-mono text-xs">{e.code}</td>
                      <td className="py-2 text-warm-600 dark:text-warm-300">{e.act}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-warm-500">
              Data milik akun lain dijawab <code className="font-mono">404</code>, bukan{' '}
              <code className="font-mono">403</code> — jadi <code className="font-mono">404</code>{' '}
              berarti &quot;tidak ada di akunmu&quot;.
            </p>
          </TabsContent>

          <TabsContent value="kuota" className="space-y-3 pt-4">
            <ul className="list-inside list-disc space-y-1.5 text-sm text-warm-600 dark:text-warm-300">
              <li>
                <strong>{RATE_LIMIT_PER_KEY} request per menit</strong> per kunci API.
              </li>
              <li>
                Setiap respons yang berhasil diautentikasi membawa{' '}
                <code className="font-mono text-xs">X-RateLimit-Limit</code>,{' '}
                <code className="font-mono text-xs">X-RateLimit-Remaining</code>, dan{' '}
                <code className="font-mono text-xs">X-RateLimit-Reset</code> (epoch detik). Respons
                401 tidak membawanya — kuota memang belum bisa dihitung sebelum kuncinya dikenali.
              </li>
              <li>
                Saat kuota habis: <code className="font-mono text-xs">429</code> +{' '}
                <code className="font-mono text-xs">Retry-After</code> (detik).
              </li>
              <li>
                Maksimal <strong>{MAX_ACTIVE_KEYS_PER_USER} kunci aktif</strong> per akun. Cabut
                kunci lama sebelum membuat yang baru.
              </li>
              <li>
                &quot;Terakhir dipakai&quot; diperbarui maksimal sekali tiap 5 menit, jadi jangan
                dipakai sebagai jam pemakaian presisi.
              </li>
              <li>
                Penghitung kuota disimpan di memori server: setelah deploy ulang, hitungan mulai
                dari nol lagi. Jangan mengandalkannya sebagai penjadwal antrean kirim.
              </li>
            </ul>
          </TabsContent>

          <TabsContent value="segera" className="space-y-3 pt-4">
            <p className="text-sm text-warm-600 dark:text-warm-300">
              Fase 1 sengaja hanya membaca data. Yang sedang disiapkan:
            </p>
            <ul className="list-inside list-disc space-y-1.5 text-sm text-warm-600 dark:text-warm-300">
              <li>
                <strong>Kirim pesan</strong> (<code className="font-mono text-xs">POST /api/v1/messages</code>)
                — otomatis memilih Baileys atau template Meta sesuai window 24 jam.
              </li>
              <li>
                <strong>Webhook keluar</strong> — pesan masuk & perubahan status dikirim ke URL-mu,
                bertanda tangan HMAC.
              </li>
            </ul>
            <p className="text-sm text-warm-500">
              Butuh salah satunya lebih cepat? Kabari kami lewat halaman Bantuan &amp; Dukungan —
              urutan pengerjaan mengikuti permintaan yang paling sering masuk.
            </p>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
