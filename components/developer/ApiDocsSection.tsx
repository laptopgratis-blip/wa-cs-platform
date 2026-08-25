// Dokumentasi API inline (server component). Sengaja tidak memakai file
// markdown eksternal supaya base URL & angka kuota selalu ikut kode yang
// benar-benar jalan.
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { RATE_LIMIT_PER_KEY } from '@/lib/public-api-auth'
import { MAX_ACTIVE_KEYS_PER_USER } from '@/lib/validations/seller-api-key'

interface ApiDocsSectionProps {
  baseUrl: string
}

function Code({ children }: { children: string }) {
  return (
    <pre className="bg-warm-900 text-warm-50 overflow-x-auto rounded-lg p-3 text-xs leading-relaxed">
      <code>{children}</code>
    </pre>
  )
}

function Endpoint({
  method,
  path,
  desc,
}: {
  method: string
  path: string
  desc: string
}) {
  return (
    <div className="border-warm-200 flex flex-col gap-1 border-b py-3 last:border-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="bg-primary-50 text-primary-700 rounded-md px-1.5 py-0.5 font-mono text-xs font-semibold">
          {method}
        </span>
        <code className="text-warm-800 font-mono text-xs">{path}</code>
      </div>
      <p className="text-warm-500 text-sm">{desc}</p>
    </div>
  )
}

const ERRORS: Array<{ http: string; code: string; act: string }> = [
  {
    http: '401',
    code: 'missing_token',
    act: 'Header Authorization belum dikirim.',
  },
  {
    http: '401',
    code: 'invalid_token',
    act: 'Kunci salah ketik atau sudah dihapus. Buat kunci baru.',
  },
  {
    http: '401',
    code: 'key_revoked',
    act: 'Kunci dicabut dari dashboard. Pakai kunci lain.',
  },
  {
    http: '401',
    code: 'key_expired',
    act: 'Masa berlaku habis. Buat kunci baru.',
  },
  {
    http: '404',
    code: 'not_found',
    act: 'Data tidak ada, atau bukan milik akun pemilik kunci.',
  },
  {
    http: '400',
    code: 'invalid_query',
    act: 'Periksa parameter di pesan error.',
  },
  {
    http: '400',
    code: 'invalid_cursor',
    act: 'Cursor sudah tidak berlaku (datanya terhapus). Ulangi dari halaman pertama.',
  },
  {
    http: '429',
    code: 'rate_limited',
    act: 'Tunggu sesuai header Retry-After lalu ulangi.',
  },
  {
    http: '500',
    code: 'server_error',
    act: 'Kesalahan di sisi kami — ulangi beberapa saat lagi.',
  },
]

export function ApiDocsSection({ baseUrl }: ApiDocsSectionProps) {
  return (
    <Card>
      <CardContent className="pt-6">
        <h2 className="font-display text-warm-900 mb-4 text-lg font-semibold">
          Dokumentasi API
        </h2>

        <Tabs defaultValue="mulai">
          <TabsList className="flex w-full flex-wrap justify-start">
            <TabsTrigger value="mulai">Mulai Cepat</TabsTrigger>
            <TabsTrigger value="endpoint">Endpoint</TabsTrigger>
            <TabsTrigger value="error">Kode Error</TabsTrigger>
            <TabsTrigger value="kuota">Batas &amp; Kuota</TabsTrigger>
            <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
          </TabsList>

          <TabsContent value="mulai" className="space-y-3 pt-4">
            <p className="text-warm-600 text-sm">
              Semua endpoint memakai base URL{' '}
              <code className="font-mono text-xs">{baseUrl}/api/v1</code> dan
              autentikasi lewat header{' '}
              <code className="font-mono text-xs">Authorization: Bearer</code>.
              Kunci tidak boleh dikirim lewat query string — nilainya akan
              tercatat di log server dan riwayat browser.
            </p>
            <Code>{`curl ${baseUrl}/api/v1/ping \\
  -H "Authorization: Bearer hl_live_xxxxxxxxxxxxxxxx"`}</Code>
            <p className="text-warm-600 text-sm">Respons sukses:</p>
            <Code>{`{
  "success": true,
  "data": { "pong": true, "keyName": "n8n produksi", "apiVersion": "v1" }
}`}</Code>
            <p className="text-warm-600 text-sm">
              Respons gagal selalu berbentuk{' '}
              <code className="font-mono text-xs">
                {'{ "success": false, "error": "...", "code": "..." }'}
              </code>{' '}
              — pakai <code className="font-mono text-xs">code</code> untuk
              logika program, bukan teks{' '}
              <code className="font-mono text-xs">error</code> yang bisa
              berubah.
            </p>
          </TabsContent>

          <TabsContent value="endpoint" className="pt-4">
            <Endpoint
              method="GET"
              path="/api/v1/ping"
              desc="Uji kunci API. Balikannya menyebut nama kunci yang dipakai."
            />
            <Endpoint
              method="GET"
              path="/api/v1/contacts?stage=&tag=&search=&limit=&cursor="
              desc="Daftar kontak. limit 1–100 (default 25). Lanjut halaman dengan nextCursor dari respons sebelumnya."
            />
            <Endpoint
              method="GET"
              path="/api/v1/contacts/{id}"
              desc="Detail satu kontak beserta jumlah pesannya."
            />
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
              <p className="text-warm-800 text-sm font-medium">
                Contoh pagination
              </p>
              <Code>{`# halaman pertama
curl "${baseUrl}/api/v1/contacts?limit=50" -H "Authorization: Bearer \$KEY"

# halaman berikutnya — pakai nextCursor dari respons sebelumnya
curl "${baseUrl}/api/v1/contacts?limit=50&cursor=ckxyz..." -H "Authorization: Bearer \$KEY"`}</Code>
              <p className="text-warm-500 text-xs">
                <code className="font-mono">nextCursor</code> bernilai{' '}
                <code className="font-mono">null</code> saat sudah halaman
                terakhir.
              </p>
            </div>
          </TabsContent>

          <TabsContent value="error" className="pt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>HTTP</TableHead>
                  <TableHead>code</TableHead>
                  <TableHead>Yang perlu dilakukan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ERRORS.map((e) => (
                  <TableRow key={e.code}>
                    <TableCell className="font-mono text-xs">
                      {e.http}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {e.code}
                    </TableCell>
                    <TableCell className="text-warm-600 whitespace-normal">
                      {e.act}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="text-warm-500 mt-3 text-xs">
              Data milik akun lain dijawab{' '}
              <code className="font-mono">404</code>, bukan{' '}
              <code className="font-mono">403</code> — jadi{' '}
              <code className="font-mono">404</code> berarti &quot;tidak ada di
              akunmu&quot;.
            </p>
          </TabsContent>

          <TabsContent value="kuota" className="space-y-3 pt-4">
            <ul className="text-warm-600 list-inside list-disc space-y-1.5 text-sm">
              <li>
                <strong>{RATE_LIMIT_PER_KEY} request per menit</strong> per
                kunci API.
              </li>
              <li>
                Setiap respons yang berhasil diautentikasi membawa{' '}
                <code className="font-mono text-xs">X-RateLimit-Limit</code>,{' '}
                <code className="font-mono text-xs">X-RateLimit-Remaining</code>
                , dan{' '}
                <code className="font-mono text-xs">X-RateLimit-Reset</code>{' '}
                (epoch detik). Respons 401 tidak membawanya — kuota memang belum
                bisa dihitung sebelum kuncinya dikenali.
              </li>
              <li>
                Saat kuota habis: <code className="font-mono text-xs">429</code>{' '}
                + <code className="font-mono text-xs">Retry-After</code>{' '}
                (detik).
              </li>
              <li>
                Maksimal <strong>{MAX_ACTIVE_KEYS_PER_USER} kunci aktif</strong>{' '}
                per akun. Cabut kunci lama sebelum membuat yang baru.
              </li>
              <li>
                &quot;Terakhir dipakai&quot; diperbarui maksimal sekali tiap 5
                menit, jadi jangan dipakai sebagai jam pemakaian presisi.
              </li>
              <li>
                Penghitung kuota disimpan di memori server: setelah deploy
                ulang, hitungan mulai dari nol lagi. Jangan mengandalkannya
                sebagai penjadwal antrean kirim.
              </li>
            </ul>
          </TabsContent>

          <TabsContent value="webhooks" className="space-y-3 pt-4">
            <p className="text-warm-600 text-sm">
              Selain menarik data lewat API, Hulao bisa <strong>mengirim event ke sistemmu</strong>{' '}
              lewat webhook — atur endpoint-nya di halaman{' '}
              <a href="/pengembang/integrasi" className="text-primary-600 underline">
                Integrasi
              </a>
              . Event yang tersedia: <code className="font-mono text-xs">message.received</code>,{' '}
              <code className="font-mono text-xs">message.status.updated</code>,{' '}
              <code className="font-mono text-xs">contact.created</code> (+{' '}
              <code className="font-mono text-xs">ping</code> untuk uji koneksi).
            </p>
            <p className="text-warm-600 text-sm">Bentuk kiriman — POST JSON:</p>
            <Code>{`{
  "id": "evt_…",
  "type": "message.received",
  "createdAt": "2026-08-25T07:00:00.000Z",
  "data": { "contactId": "…", "phoneNumber": "628…", "content": "…" }
}`}</Code>
            <p className="text-warm-600 text-sm">
              Setiap kiriman membawa header{' '}
              <code className="font-mono text-xs">X-Hulao-Signature: t=&lt;unix&gt;,v1=&lt;hex&gt;</code>.
              Verifikasi dengan menghitung ulang HMAC SHA-256 atas string{' '}
              <code className="font-mono text-xs">{'`${t}.${rawBody}`'}</code> memakai signing secret{' '}
              <code className="font-mono text-xs">whsec_…</code> milik endpoint:
            </p>
            <Code>{`const [tPart, vPart] = sigHeader.split(',')
const t = tPart.slice(2), v1 = vPart.slice(3)
const expected = crypto.createHmac('sha256', process.env.HULAO_WEBHOOK_SECRET)
  .update(\`\${t}.\${rawBody}\`).digest('hex')
const valid = crypto.timingSafeEqual(Buffer.from(v1, 'hex'), Buffer.from(expected, 'hex'))
// tolak juga bila |now - t| > 5 menit (anti replay)`}</Code>
            <ul className="text-warm-600 list-inside list-disc space-y-1.5 text-sm">
              <li>Balas <code className="font-mono text-xs">2xx</code> secepatnya (&lt;10 detik) — proses beratnya belakangan.</li>
              <li>Gagal di-retry bertahap sampai 6× (±1m, 5m, 30m, 2j, 8j); gagal beruntun terus menonaktifkan endpoint otomatis.</li>
              <li>Redirect tidak diikuti dan alamat internal/privat ditolak.</li>
              <li>Kiriman bisa datang lebih dari sekali — jadikan <code className="font-mono text-xs">id</code> event kunci dedup.</li>
            </ul>
            <p className="text-warm-500 text-sm">
              Berikutnya: <strong>kirim pesan</strong> (<code className="font-mono text-xs">POST /api/v1/messages</code>).
              Butuh lebih cepat? Kabari lewat halaman Bantuan &amp; Dukungan.
            </p>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
