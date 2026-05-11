// Wrapper tipis untuk nodemailer — hanya dipakai server-side.
// Untuk dev pakai Mailtrap (mailtrap.io) supaya email tidak benar-benar terkirim.
import nodemailer, { type Transporter } from 'nodemailer'

let cachedTransporter: Transporter | null = null

function getTransporter(): Transporter {
  if (cachedTransporter) return cachedTransporter

  const host = process.env.EMAIL_HOST
  const port = Number(process.env.EMAIL_PORT)
  const user = process.env.EMAIL_USER
  const pass = process.env.EMAIL_PASS

  if (!host || !port || !user || !pass) {
    throw new Error(
      'Konfigurasi email belum lengkap. Set EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS di .env.local',
    )
  }

  cachedTransporter = nodemailer.createTransport({
    host,
    port,
    // Mailtrap & sebagian besar SMTP relay pakai STARTTLS di port 587/2525.
    // Port 465 = TLS langsung.
    secure: port === 465,
    auth: { user, pass },
  })

  return cachedTransporter
}

// OTP auth (login/signup) — kode 6-digit, TTL 5 menit. Mode menentukan
// subject + intro paragraph supaya user paham konteks.
export async function sendAuthOtpEmail(
  email: string,
  code: string,
  mode: 'LOGIN' | 'SIGNUP',
): Promise<void> {
  const transporter = getTransporter()
  const subject =
    mode === 'SIGNUP'
      ? 'Verifikasi pendaftaran — Hulao'
      : 'Kode OTP login — Hulao'
  const intro =
    mode === 'SIGNUP'
      ? 'Gunakan kode di bawah untuk menyelesaikan pendaftaran akun Hulao kamu:'
      : 'Gunakan kode di bawah untuk login ke akun Hulao kamu:'
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #1f1f1f;">
      <h2 style="color: #ea580c; margin-bottom: 16px;">${
        mode === 'SIGNUP' ? 'Verifikasi Pendaftaran' : 'Kode OTP Login'
      }</h2>
      <p>Halo,</p>
      <p>${intro}</p>
      <div style="margin: 24px 0; padding: 20px; background: #fff7ed; border: 1px solid #fed7aa; border-radius: 10px; text-align: center;">
        <div style="font-family: 'SFMono-Regular', Consolas, monospace; font-size: 32px; font-weight: 700; letter-spacing: 0.5em; color: #c2570a;">
          ${code}
        </div>
      </div>
      <p style="font-size: 14px; color: #666;">Kode berlaku <strong>5 menit</strong>. Jangan bagikan ke siapa pun, termasuk pihak yang mengaku dari Hulao.</p>
      <p style="font-size: 14px; color: #666;">Kalau bukan kamu yang minta kode ini, abaikan email ini — akun kamu aman.</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
      <p style="font-size: 12px; color: #999;">Hulao — Email otomatis, jangan dibalas.</p>
    </div>
  `
  await transporter.sendMail({
    from: defaultFrom(),
    to: email,
    subject,
    html,
    text:
      `${intro}\n\nKode OTP: ${code}\n\nBerlaku 5 menit. Jangan bagikan ke siapa pun.\n` +
      `Kalau bukan kamu yang minta kode ini, abaikan email ini.`,
  })
}

export async function sendPasswordResetEmail(email: string, resetUrl: string) {
  const from = process.env.EMAIL_FROM ?? 'Hulao <noreply@hulao.id>'
  const transporter = getTransporter()

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1f1f1f;">
      <h2 style="color: #ea580c; margin-bottom: 16px;">Reset Password</h2>
      <p>Halo,</p>
      <p>Kami menerima permintaan untuk mereset password akun Hulao kamu. Klik tombol di bawah untuk membuat password baru:</p>
      <p style="margin: 24px 0;">
        <a href="${resetUrl}"
           style="display: inline-block; background: #ea580c; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
          Reset Password
        </a>
      </p>
      <p style="font-size: 14px; color: #666;">Atau copy URL ini di browser:<br/><span style="word-break: break-all;">${resetUrl}</span></p>
      <p style="font-size: 14px; color: #666;">Link berlaku 15 menit. Jika kamu tidak meminta reset password, abaikan email ini.</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
      <p style="font-size: 12px; color: #999;">Hulao — Email otomatis, jangan dibalas.</p>
    </div>
  `

  await transporter.sendMail({
    from,
    to: email,
    subject: 'Reset Password — Hulao',
    html,
    text:
      `Halo,\n\nKami menerima permintaan reset password akun Hulao kamu.\n` +
      `Buka link ini untuk membuat password baru (berlaku 15 menit):\n\n${resetUrl}\n\n` +
      `Jika kamu tidak meminta reset, abaikan email ini.`,
  })
}

interface ManualPaymentEmailContext {
  userEmail: string
  userName?: string | null
  packageName: string
  tokenAmount: number
  totalAmount: number
}

function defaultFrom(): string {
  return process.env.EMAIL_FROM ?? 'Hulao <noreply@hulao.id>'
}

function formatNumberID(n: number): string {
  return new Intl.NumberFormat('id-ID').format(n)
}

function formatRupiahID(n: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(n)
}

// Email konfirmasi pembayaran manual sudah disetujui & token ditambahkan.
export async function sendManualPaymentConfirmedEmail(ctx: ManualPaymentEmailContext) {
  const transporter = getTransporter()
  const greet = ctx.userName ? `Halo ${ctx.userName},` : 'Halo,'
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1f1f1f;">
      <h2 style="color: #16a34a; margin-bottom: 16px;">Pembayaran Dikonfirmasi</h2>
      <p>${greet}</p>
      <p>Pembayaran transfer manual kamu sudah diverifikasi. <strong>${formatNumberID(ctx.tokenAmount)} token</strong> dari paket
        <strong>${ctx.packageName}</strong> sudah ditambahkan ke saldo kamu.</p>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr><td style="padding: 6px 0; color: #666;">Paket</td><td style="text-align:right; font-weight:600;">${ctx.packageName}</td></tr>
        <tr><td style="padding: 6px 0; color: #666;">Token</td><td style="text-align:right; font-weight:600;">${formatNumberID(ctx.tokenAmount)}</td></tr>
        <tr><td style="padding: 6px 0; color: #666;">Total transfer</td><td style="text-align:right; font-weight:600;">${formatRupiahID(ctx.totalAmount)}</td></tr>
      </table>
      <p>Cek saldo kamu di halaman Billing.</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
      <p style="font-size: 12px; color: #999;">Hulao — Email otomatis, jangan dibalas.</p>
    </div>
  `
  await transporter.sendMail({
    from: defaultFrom(),
    to: ctx.userEmail,
    subject: 'Token kamu sudah ditambahkan — Hulao',
    html,
    text:
      `${greet}\n\nPembayaran transfer manual kamu sudah diverifikasi. ${formatNumberID(ctx.tokenAmount)} token ` +
      `dari paket ${ctx.packageName} sudah ditambahkan ke saldo kamu.\n\nCek di halaman Billing.`,
  })
}

interface StudentMagicLinkEmailContext {
  email: string
  magicUrl: string
  studentName?: string | null
  courseTitle?: string
}

// Magic link login portal student — alternatif OTP WA. Subject ringkas
// supaya tidak masuk spam. Body include link big-button + plain URL fallback.
export async function sendStudentMagicLinkEmail(
  ctx: StudentMagicLinkEmailContext,
): Promise<void> {
  const transporter = getTransporter()
  const greet = ctx.studentName ? `Halo ${ctx.studentName},` : 'Halo,'
  const courseLine = ctx.courseTitle
    ? `Akses untuk <strong>${ctx.courseTitle}</strong> sudah aktif.`
    : `Akses portal belajar Hulao kamu sudah siap.`
  const subject = ctx.courseTitle
    ? `Akses kelas: ${ctx.courseTitle} — Hulao`
    : 'Akses portal belajar — Hulao'
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1f1f1f;">
      <h2 style="color: #ea580c; margin-bottom: 16px;">Login Portal Belajar</h2>
      <p>${greet}</p>
      <p>${courseLine}</p>
      <p>Klik tombol di bawah untuk langsung masuk ke portal — tidak perlu OTP:</p>
      <p style="margin: 24px 0;">
        <a href="${ctx.magicUrl}"
           style="display: inline-block; background: #ea580c; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
          Masuk Sekarang
        </a>
      </p>
      <p style="font-size: 14px; color: #666;">Atau copy URL ini ke browser:<br/><span style="word-break: break-all;">${ctx.magicUrl}</span></p>
      <p style="font-size: 14px; color: #666;">Link berlaku 90 hari, simpan supaya bisa dipakai lagi nanti tanpa OTP.</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
      <p style="font-size: 12px; color: #999;">Hulao Belajar — Email otomatis, jangan dibalas. Kalau bukan kamu yang request, abaikan email ini.</p>
    </div>
  `
  await transporter.sendMail({
    from: defaultFrom(),
    to: ctx.email,
    subject,
    html,
    text:
      `${greet}\n\n${ctx.courseTitle ? `Akses untuk ${ctx.courseTitle} sudah aktif.` : 'Akses portal belajar Hulao kamu sudah siap.'}\n\n` +
      `Klik link ini untuk langsung masuk (berlaku 90 hari):\n${ctx.magicUrl}\n\n` +
      `Kalau bukan kamu yang request, abaikan email ini.`,
  })
}

interface ManualPaymentRejectedContext extends ManualPaymentEmailContext {
  reason: string
}

// Email pemberitahuan pembayaran manual ditolak dengan alasan.
export async function sendManualPaymentRejectedEmail(ctx: ManualPaymentRejectedContext) {
  const transporter = getTransporter()
  const greet = ctx.userName ? `Halo ${ctx.userName},` : 'Halo,'
  const safeReason = ctx.reason.replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1f1f1f;">
      <h2 style="color: #dc2626; margin-bottom: 16px;">Pembayaran Ditolak</h2>
      <p>${greet}</p>
      <p>Mohon maaf, pembayaran transfer manual kamu untuk paket
        <strong>${ctx.packageName}</strong> (${formatRupiahID(ctx.totalAmount)}) tidak dapat diverifikasi.</p>
      <div style="background:#fef2f2; border:1px solid #fecaca; border-radius:8px; padding:12px; margin:16px 0;">
        <div style="font-size:12px; color:#991b1b; font-weight:600; text-transform:uppercase; letter-spacing:.05em;">Alasan</div>
        <div style="margin-top:6px;">${safeReason}</div>
      </div>
      <p>Kamu bisa membuat order baru dari halaman Billing, atau hubungi admin untuk klarifikasi.</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
      <p style="font-size: 12px; color: #999;">Hulao — Email otomatis, jangan dibalas.</p>
    </div>
  `
  await transporter.sendMail({
    from: defaultFrom(),
    to: ctx.userEmail,
    subject: 'Pembayaran ditolak — Hulao',
    html,
    text:
      `${greet}\n\nMohon maaf, pembayaran kamu untuk paket ${ctx.packageName} (${formatRupiahID(ctx.totalAmount)}) ` +
      `tidak dapat diverifikasi.\n\nAlasan: ${ctx.reason}\n\nKamu bisa membuat order baru di halaman Billing.`,
  })
}
