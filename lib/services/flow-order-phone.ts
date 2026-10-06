// Nomor customer untuk UserOrder dari Sales Flow WA (PURE, tanpa Prisma).
//
// Step 'phone' di flow-engine hanya membuang non-digit, jadi "0812 3456 7890"
// tersimpan "081234567890". Nomor itu dipakai follow-up (JID
// "081234567890@s.whatsapp.net" — INVALID: Baileys tetap "berhasil" tapi pesan
// tak pernah sampai) dan lookup FollowUpBlacklist (yang menyimpan "628xx").
// Helper ini menyamakan format ke digit "628xx" tanpa membuang data kurir.
import { normalizePhone, toWaNumber } from '../phone'

// Normalisasi ke "628xx" bila nomor Indonesia valid; selain itu kembalikan
// digit apa adanya (nomor luar negeri / ketikan aneh tetap terlihat seller).
function normalizeOrKeepDigits(raw: string): string {
  const digits = toWaNumber(raw)
  if (!digits) return ''
  return toWaNumber(normalizePhone(digits)) ?? digits
}

// Prioritas: nomor yang diketik customer di step phone → nomor kontak WA yang
// sedang chat. Kontak berbentuk JID penuh (mis. `<lid>@lid`) dipertahankan
// apa adanya karena LID adalah ID opaque, bukan nomor.
export function resolveFlowOrderPhone(
  collected: string | null | undefined,
  contactPhone: string | null | undefined,
): string {
  const typed = normalizeOrKeepDigits(collected ?? '')
  if (typed) return typed
  const contact = (contactPhone ?? '').trim()
  if (!contact) return ''
  if (contact.includes('@')) return contact
  return normalizeOrKeepDigits(contact)
}

// Nomor yang layak dikirimi follow-up: JID penuh (wa-service memakainya apa
// adanya) atau digit internasional 10-15 tanpa awalan 0 / '+'.
const INTL_DIGITS = /^[1-9]\d{9,14}$/

export function isFollowUpDeliverablePhone(phone: string): boolean {
  if (phone.includes('@')) return true
  return INTL_DIGITS.test(phone)
}
