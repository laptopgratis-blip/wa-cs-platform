// Uji tujuan redirect setelah login. Jalankan lewat `npm test`.
import assert from 'node:assert/strict'

import {
  landingPathForRole,
  loginRedirectHref,
  resolveLoginRedirect,
} from './auth-landing'

let passed = 0
function check(name: string, fn: () => void): void {
  fn()
  passed += 1
  console.log(`  ok  ${name}`)
}

console.log('auth-landing: landingPathForRole')

check('ADMIN → /admin/dashboard', () => {
  assert.equal(landingPathForRole('ADMIN'), '/admin/dashboard')
})
check('FINANCE → /admin/finance (middleware hanya izinkan itu)', () => {
  assert.equal(landingPathForRole('FINANCE'), '/admin/finance')
})
check('USER → /dashboard', () => {
  assert.equal(landingPathForRole('USER'), '/dashboard')
})
check('role null/tak dikenal → /dashboard', () => {
  assert.equal(landingPathForRole(null), '/dashboard')
  assert.equal(landingPathForRole('SOMETHING'), '/dashboard')
})

console.log('\nauth-landing: resolveLoginRedirect')

check('tanpa callbackUrl → ikut role', () => {
  assert.equal(resolveLoginRedirect(null, 'ADMIN'), '/admin/dashboard')
  assert.equal(resolveLoginRedirect(undefined, 'USER'), '/dashboard')
})

check('callbackUrl spesifik dihormati (user balik ke tujuan semula)', () => {
  assert.equal(resolveLoginRedirect('/inbox', 'ADMIN'), '/inbox')
  assert.equal(
    resolveLoginRedirect('/admin/finance', 'FINANCE'),
    '/admin/finance',
  )
})

check(
  'callbackUrl generik /dashboard TIDAK menahan admin — ini inti bug-nya',
  () => {
    // Tombol login menyisipkan callbackUrl='/dashboard' secara default; kalau
    // dihormati mentah-mentah, admin tetap mendarat di dashboard user.
    assert.equal(
      resolveLoginRedirect('/dashboard', 'ADMIN'),
      '/admin/dashboard',
    )
    assert.equal(resolveLoginRedirect('/dashboard', 'USER'), '/dashboard')
  },
)

check('URL absolut ditolak (anti open redirect)', () => {
  assert.equal(resolveLoginRedirect('https://evil.com', 'USER'), '/dashboard')
  assert.equal(
    resolveLoginRedirect('http://evil.com/x', 'ADMIN'),
    '/admin/dashboard',
  )
})

check('protocol-relative //evil.com ditolak', () => {
  assert.equal(resolveLoginRedirect('//evil.com', 'ADMIN'), '/admin/dashboard')
})

check('string kosong → ikut role', () => {
  assert.equal(resolveLoginRedirect('', 'FINANCE'), '/admin/finance')
})

console.log('\nauth-landing: loginRedirectHref')

check('path relatif → /login?callbackUrl ter-encode', () => {
  assert.equal(loginRedirectHref('/pricing'), '/login?callbackUrl=%2Fpricing')
})
check('round-trip: callbackUrl hasilnya dihormati resolveLoginRedirect', () => {
  const href = loginRedirectHref('/pricing-lms')
  const param = new URL(href, 'https://hulao.id').searchParams.get(
    'callbackUrl',
  )
  assert.equal(resolveLoginRedirect(param, 'USER'), '/pricing-lms')
})
check('URL absolut / protocol-relative ditolak (bug pemanggil)', () => {
  assert.throws(() => loginRedirectHref('https://evil.com'))
  assert.throws(() => loginRedirectHref('//evil.com'))
})

console.log(`\nauth-landing: ${passed} pemeriksaan lolos`)
