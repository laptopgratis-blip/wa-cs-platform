// Phone number utilities — default Indonesia (+62). Dipakai auth OTP +
// tempat lain yang butuh validasi/normalisasi nomor WA.

// Normalisasi input nomor HP Indonesia ke format E.164 "+628xxxxxxxx".
// Terima: "08123456789", "8123456789", "628123456789", "+628123456789",
// dgn spasi/strip/garis bawah. Return null kalau invalid.
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null
  // Buang semua non-digit kecuali '+'.
  let digits = input.replace(/[^\d+]/g, '')
  // Kalau diawali '+', hilangkan '+' supaya cuma digit.
  if (digits.startsWith('+')) digits = digits.slice(1)
  // Prefix Indonesia: '0' atau '62' atau langsung '8'.
  if (digits.startsWith('0')) digits = '62' + digits.slice(1)
  else if (digits.startsWith('8')) digits = '62' + digits
  // Sekarang harus diawali '62' diikuti '8' (mobile Indonesia: 8XX).
  if (!digits.startsWith('628')) return null
  // Panjang total 62 + 9-13 digit = 11-15 digit. WA Indonesia umum 10-13 digit
  // setelah '8'. Total dgn 62: 12-15.
  if (digits.length < 11 || digits.length > 15) return null
  if (!/^\d+$/.test(digits)) return null
  return '+' + digits
}

// Mask email untuk UI feedback: "abcde@gmail.com" → "a***@gmail.com".
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!local || !domain) return email
  if (local.length <= 1) return `${local}***@${domain}`
  return `${local[0]}***@${domain}`
}

// Mask phone untuk UI feedback: "+628123456789" → "+62***6789".
export function maskPhone(e164: string): string {
  if (!e164.startsWith('+') || e164.length < 7) return e164
  const cc = e164.slice(0, 3) // "+62"
  const tail = e164.slice(-4)
  return `${cc}***${tail}`
}
