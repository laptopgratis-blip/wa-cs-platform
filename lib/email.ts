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
