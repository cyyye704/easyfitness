export class CorosError extends Error {
  status: number
  code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'CorosError'
    this.status = status
    this.code = code
  }
}

export const upstreamError = () => new CorosError(
  502, 'COROS_UPSTREAM_UNAVAILABLE', 'COROS 服务暂时不可用，请稍后重试。',
)

export const reconnectError = () => new CorosError(
  401, 'COROS_RECONNECT_REQUIRED', 'COROS 授权已失效，请重新连接。',
)

export const corosJson = (body: unknown, status = 200, cookies: string[] = []) => {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
  })
  for (const cookie of cookies) headers.append('Set-Cookie', cookie)
  return new Response(JSON.stringify(body), { status, headers })
}

// Read incrementally so a misleading/missing Content-Length cannot bypass the cap.
export const readBoundedJson = async (response: Response, maximumBytes = 32_768): Promise<unknown> => {
  const reader = response.body?.getReader()
  if (!reader) throw upstreamError()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > maximumBytes) {
        await reader.cancel()
        throw upstreamError()
      }
      chunks.push(value)
    }
    const bytes = new Uint8Array(length)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    throw upstreamError()
  } finally {
    reader.releaseLock()
  }
}

export const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

export const isTokenString = (value: unknown, maximumLength: number): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= maximumLength &&
  !/\s/.test(value) && ![...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
