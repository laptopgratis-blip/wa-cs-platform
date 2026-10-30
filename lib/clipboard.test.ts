// Uji copyText. Jalankan lewat `npm test`.
import assert from 'node:assert/strict'

import { copyText } from './clipboard'

let passed = 0
async function check(name: string, fn: () => Promise<void>): Promise<void> {
  await fn()
  passed += 1
  console.log(`  ok  ${name}`)
}

// Stub minimal global browser — test jalan di Node tanpa DOM.
interface FakeTextarea {
  value: string
  style: { cssText: string }
  setAttribute: (k: string, v: string) => void
  select: () => void
  setSelectionRange: (a: number, b: number) => void
}

interface Env {
  writeText?: (t: string) => Promise<void>
  secure?: boolean
  execCommand?: () => boolean
  noDocument?: boolean
}

function setGlobal(key: string, value: unknown): void {
  Object.defineProperty(globalThis, key, {
    value,
    configurable: true,
    writable: true,
  })
}

const attached: FakeTextarea[] = []
let selectionRange: [number, number] | null = null
// Elemen yang fokus sebelum salin (mis. tombol "URL") — harus dipulihkan.
const focusCalls: { preventScroll?: boolean }[] = []
const prevFocused = {
  focus: (opts?: { preventScroll?: boolean }) => {
    focusCalls.push(opts ?? {})
  },
}

function install(env: Env): void {
  attached.length = 0
  selectionRange = null
  focusCalls.length = 0
  setGlobal(
    'navigator',
    env.writeText ? { clipboard: { writeText: env.writeText } } : {},
  )
  setGlobal('window', { isSecureContext: env.secure ?? true })
  if (env.noDocument) {
    setGlobal('document', undefined)
    return
  }
  setGlobal('document', {
    createElement: (): FakeTextarea => ({
      value: '',
      style: { cssText: '' },
      setAttribute: () => {},
      select: () => {},
      setSelectionRange: (a: number, b: number) => {
        selectionRange = [a, b]
      },
    }),
    body: {
      appendChild: (el: FakeTextarea) => attached.push(el),
      removeChild: (el: FakeTextarea) => {
        const i = attached.indexOf(el)
        if (i >= 0) attached.splice(i, 1)
      },
    },
    execCommand: env.execCommand ?? (() => true),
    activeElement: prevFocused,
  })
}

async function main(): Promise<void> {
  await check('Clipboard API sukses → true tanpa fallback', async () => {
    const written: string[] = []
    let execCalled = false
    install({
      writeText: async (t) => {
        written.push(t)
      },
      execCommand: () => {
        execCalled = true
        return true
      },
    })
    assert.equal(await copyText('https://hulao.id/a.png'), true)
    assert.deepEqual(written, ['https://hulao.id/a.png'])
    assert.equal(execCalled, false)
  })

  await check('Clipboard API ditolak → fallback textarea dipakai', async () => {
    install({
      writeText: async () => {
        throw new Error('NotAllowedError')
      },
      execCommand: () => true,
    })
    assert.equal(await copyText('abc'), true)
    // textarea selalu dibersihkan dari DOM
    assert.equal(attached.length, 0)
    // iOS butuh setSelectionRange eksplisit
    assert.deepEqual(selectionRange, [0, 3])
  })

  await check('bukan secure context → langsung fallback', async () => {
    let apiCalled = false
    install({
      secure: false,
      writeText: async () => {
        apiCalled = true
      },
      execCommand: () => true,
    })
    assert.equal(await copyText('abc'), true)
    assert.equal(apiCalled, false)
  })

  await check('tanpa Clipboard API & execCommand false → false', async () => {
    install({ execCommand: () => false })
    assert.equal(await copyText('abc'), false)
    assert.equal(attached.length, 0)
  })

  await check(
    'execCommand throw → false, textarea tetap dibersihkan',
    async () => {
      install({
        execCommand: () => {
          throw new Error('boom')
        },
      })
      assert.equal(await copyText('abc'), false)
      assert.equal(attached.length, 0)
    },
  )

  await check('fallback memulihkan fokus ke elemen sebelumnya', async () => {
    install({ execCommand: () => true })
    assert.equal(await copyText('abc'), true)
    assert.deepEqual(focusCalls, [{ preventScroll: true }])
  })

  await check('fallback gagal pun tetap memulihkan fokus', async () => {
    install({
      execCommand: () => {
        throw new Error('boom')
      },
    })
    assert.equal(await copyText('abc'), false)
    assert.equal(focusCalls.length, 1)
  })

  await check('Clipboard API sukses tidak menyentuh fokus', async () => {
    install({ writeText: async () => {} })
    assert.equal(await copyText('abc'), true)
    assert.equal(focusCalls.length, 0)
  })

  await check('tanpa document (SSR) → false tanpa crash', async () => {
    install({ noDocument: true })
    assert.equal(await copyText('abc'), false)
  })

  console.log(`clipboard: ${passed} lulus`)
}

void main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
