import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import type { CorosConfig } from './config.js'
import { CorosError, isObject } from './http.js'

const COOKIE_PATH = '/api/coros'
const CHUNK_SIZE = 3_600
const MAX_CHUNKS = 3
export const FLOW_SECONDS = 600
export const CONNECTION_SECONDS = 180 * 24 * 60 * 60
type CookieKind = 'flow' | 'connection'

const nameFor = (kind: CookieKind, config: CorosConfig, index: number) =>
  `${config.secure ? '__Secure-' : ''}ef-coros-${kind}-${index}`

const attributes = (config: CorosConfig, seconds: number) =>
  `Path=${COOKIE_PATH}; HttpOnly; SameSite=Lax; Max-Age=${Math.max(0, Math.floor(seconds))}${config.secure ? '; Secure' : ''}`

export const clearCorosCookies = (kind: CookieKind, config: CorosConfig): string[] =>
  Array.from({ length: MAX_CHUNKS }, (_, index) => `${nameFor(kind, config, index)}=; ${attributes(config, 0)}`)

export const sealCookie = (
  kind: CookieKind, payload: Record<string, unknown>, config: CorosConfig, seconds: number,
): string[] => {
  const nonce = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', config.secret, nonce)
  cipher.setAAD(Buffer.from(`easyfitness:coros:${kind}:v1:${config.origin}`))
  const plaintext = JSON.stringify({ ...payload, cookieExpires: Date.now() + seconds * 1_000 })
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const sealed = Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]).toString('base64url')
  if (sealed.length > CHUNK_SIZE * MAX_CHUNKS) {
    throw new CorosError(502, 'COROS_CONNECTION_TOO_LARGE', 'COROS 授权数据过大，暂时无法保存连接。')
  }
  // Clear unused chunks too, otherwise a shorter rotated token could be joined to stale data.
  return Array.from({ length: MAX_CHUNKS }, (_, index) => {
    const value = sealed.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE)
    return `${nameFor(kind, config, index)}=${value}; ${attributes(config, value ? seconds : 0)}`
  })
}

export const readCookie = (kind: CookieKind, request: Request, config: CorosConfig): Record<string, unknown> | null => {
  try {
    const header = request.headers.get('cookie') ?? ''
    if (header.length > 24_000) return null
    const entries = header.split(';').map((part) => part.trim().split('='))
    let sealed = ''
    for (let index = 0; index < MAX_CHUNKS; index += 1) {
      const matches = entries.filter(([name]) => name === nameFor(kind, config, index))
      if (matches.length > 1) return null
      const value = matches[0]?.[1] ?? ''
      if (value.length > CHUNK_SIZE || (value && !/^[A-Za-z0-9_-]+$/.test(value))) return null
      sealed += value
    }
    const buffer = Buffer.from(sealed, 'base64url')
    if (buffer.length < 29) return null
    const decipher = createDecipheriv('aes-256-gcm', config.secret, buffer.subarray(0, 12))
    decipher.setAAD(Buffer.from(`easyfitness:coros:${kind}:v1:${config.origin}`))
    decipher.setAuthTag(buffer.subarray(12, 28))
    const plaintext = Buffer.concat([decipher.update(buffer.subarray(28)), decipher.final()]).toString('utf8')
    const payload: unknown = JSON.parse(plaintext)
    if (!isObject(payload) || typeof payload.cookieExpires !== 'number' || payload.cookieExpires <= Date.now()) return null
    return payload
  } catch {
    return null
  }
}
