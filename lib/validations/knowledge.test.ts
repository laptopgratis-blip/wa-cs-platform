// Uji skema knowledge — fokus fileUrl IMAGE/FILE (anti SSRF & traversal).
// fileUrl dipakai wa-service sebagai URL fetch Baileys, jadi hanya path hasil
// route upload yang boleh lolos. Jalankan lewat `npm test`.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import {
  isOwnKnowledgeFileUrl,
  KNOWLEDGE_FILE_URL,
  knowledgeCreateSchema,
  knowledgeUpdateSchema,
} from './knowledge'

let passed = 0
function check(name: string, fn: () => void): void {
  fn()
  passed += 1
  console.log(`  ok  ${name}`)
}

const OWNER = 'cmabc123owner'
const OWN_IMAGE = `/uploads/knowledge/${OWNER}/0f1e2d3c4b5a69788796.jpg`
const OWN_FILE = `/uploads/knowledge/${OWNER}/a1b2c3d4e5f60718293a.pdf`

// Variasi URL berbahaya / di luar folder upload knowledge.
const BAD_URLS = [
  'http://hulao-postgres:5432/',
  'https://169.254.169.254/latest/meta-data/',
  'http://hulao-uploads/uploads/knowledge/u1/a.jpg',
  'HTTP://localhost:3001/sessions',
  '//evil.example/uploads/knowledge/u1/a.jpg',
  'file:///etc/passwd',
  `uploads/knowledge/${OWNER}/a.jpg`,
  `/uploads/knowledge/${OWNER}/../../../package.json`,
  `/uploads/knowledge/${OWNER}/..%2f..%2fpackage.json`,
  `/uploads/knowledge/${OWNER}/sub/a.jpg`,
  `/uploads/knowledge/${OWNER}/a.jpg?x=1`,
  `/uploads/knowledge/${OWNER}/a.jpg#frag`,
  `/uploads/knowledge/${OWNER}\\a.jpg`,
  `/uploads/knowledge/${OWNER}/a`,
  `/uploads/products/${OWNER}/a.jpg`,
  '/api/internal/knowledge/x',
]

function createImage(fileUrl: string) {
  return knowledgeCreateSchema.safeParse({
    contentType: 'IMAGE',
    title: 'Foto testimoni',
    fileUrl,
  })
}

console.log('validations/knowledge: fileUrl')

check('create IMAGE: path hasil upload → lolos', () => {
  assert.equal(createImage(OWN_IMAGE).success, true)
})

check('create FILE: path hasil upload → lolos', () => {
  const r = knowledgeCreateSchema.safeParse({
    contentType: 'FILE',
    title: 'Katalog',
    fileUrl: OWN_FILE,
  })
  assert.equal(r.success, true)
})

check('create IMAGE: URL eksternal / traversal / folder lain → ditolak', () => {
  for (const url of BAD_URLS) {
    assert.equal(createImage(url).success, false, `harusnya ditolak: ${url}`)
  }
})

check('create IMAGE: pesan error ramah, tanpa detail teknis', () => {
  const r = createImage('http://hulao-postgres:5432/')
  assert.equal(r.success, false)
  if (!r.success) {
    assert.match(r.error.issues[0]?.message ?? '', /upload/i)
  }
})

check('create FILE: URL eksternal → ditolak', () => {
  const r = knowledgeCreateSchema.safeParse({
    contentType: 'FILE',
    title: 'Katalog',
    fileUrl: 'https://example.com/katalog.pdf',
  })
  assert.equal(r.success, false)
})

check('update: fileUrl hasil upload → lolos', () => {
  assert.equal(knowledgeUpdateSchema.safeParse({ fileUrl: OWN_IMAGE }).success, true)
})

check('update: fileUrl tidak dikirim / null → lolos (edit sebagian)', () => {
  assert.equal(knowledgeUpdateSchema.safeParse({ title: 'Baru' }).success, true)
  assert.equal(knowledgeUpdateSchema.safeParse({ fileUrl: null }).success, true)
})

check('update: URL eksternal / traversal → ditolak', () => {
  for (const url of BAD_URLS) {
    const r = knowledgeUpdateSchema.safeParse({ fileUrl: url })
    assert.equal(r.success, false, `harusnya ditolak: ${url}`)
  }
})

console.log('validations/knowledge: isOwnKnowledgeFileUrl')

check('file milik user sendiri → true', () => {
  assert.equal(isOwnKnowledgeFileUrl(OWN_IMAGE, OWNER), true)
  assert.equal(isOwnKnowledgeFileUrl(OWN_FILE, OWNER), true)
})

check('file di folder user lain → false', () => {
  assert.equal(isOwnKnowledgeFileUrl(OWN_IMAGE, 'cmlainorang999'), false)
})

check('URL eksternal / traversal / folder lain → false', () => {
  for (const url of BAD_URLS) {
    assert.equal(isOwnKnowledgeFileUrl(url, OWNER), false, url)
  }
})

check('newline di ujung tidak lolos (regex tanpa flag m)', () => {
  assert.equal(isOwnKnowledgeFileUrl(`${OWN_IMAGE}\nhttp://x`, OWNER), false)
  assert.equal(isOwnKnowledgeFileUrl(`${OWN_IMAGE}\n`, OWNER), false)
})

check('nilai kosong / null / userId kosong → false', () => {
  assert.equal(isOwnKnowledgeFileUrl('', OWNER), false)
  assert.equal(isOwnKnowledgeFileUrl(null, OWNER), false)
  assert.equal(isOwnKnowledgeFileUrl(undefined, OWNER), false)
  assert.equal(isOwnKnowledgeFileUrl(OWN_IMAGE, ''), false)
})

console.log('validations/knowledge: paritas wa-service')

check('regex di wa-service identik (paket terpisah, disalin manual)', () => {
  // npm test jalan dari root repo. Kalau salah satu salinan dilonggarkan,
  // lapisan lain diam-diam ikut longgar → tes ini menangkapnya.
  const src = readFileSync(
    path.join(process.cwd(), 'wa-service/src/knowledge-attachment.ts'),
    'utf8',
  )
  assert.ok(
    src.includes(`/${KNOWLEDGE_FILE_URL.source}/`),
    'KNOWLEDGE_FILE_URL wa-service beda dengan lib/validations/knowledge.ts',
  )
})

console.log(`validations/knowledge: ${passed} ok`)
