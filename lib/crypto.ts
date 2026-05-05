// AES-256-GCM helper untuk enkripsi rahasia (mis. API key provider AI) di DB.
// Format ciphertext: <iv-hex>:<authTag-hex>:<ciphertext-hex>
// IV di-generate random per panggilan encrypt() supaya plaintext yang sama
// tidak menghasilkan ciphertext yang sama → cegah pattern leak.
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'node:crypto'

const ALGO = 'aes-256-gcm'
const IV_LENGTH = 12 // GCM standar 96-bit
const AUTH_TAG_LENGTH = 16

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY
  if (!hex || hex.length !== 64) {
    throw new Error(
      'ENCRYPTION_KEY belum di-set atau panjangnya bukan 64 karakter hex (32 byte).',
    )
  }
  return Buffer.from(hex, 'hex')
}

export function encrypt(plaintext: string): string {
  const key = getKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGO, key, iv)
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`
}

export function decrypt(payload: string): string {
  const key = getKey()
  const parts = payload.split(':')
  if (parts.length !== 3) {
    throw new Error('Ciphertext format tidak valid')
  }
  const [ivHex, tagHex, dataHex] = parts as [string, string, string]
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(tagHex, 'hex')
  const data = Buffer.from(dataHex, 'hex')
  if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error('Ciphertext format tidak valid')
  }
  const decipher = createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(authTag)
  const plaintext = Buffer.concat([decipher.update(data), decipher.final()])
  return plaintext.toString('utf8')
}

// Mask key untuk display di UI: tampilkan 4 karakter terakhir.
export function maskKey(plaintext: string): string {
  if (plaintext.length <= 4) return '••••'
  return `••••••••${plaintext.slice(-4)}`
}
