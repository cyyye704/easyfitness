import { parseCorosPreview } from './parser.js'

type McpErrorCode = 'COROS_RECONNECT_REQUIRED' | 'COROS_UPSTREAM_UNAVAILABLE' | 'COROS_INVALID_DATA'

export class CorosMcpError extends Error {
  code: McpErrorCode
  constructor(code: McpErrorCode, message: string) {
    super(message)
    this.name = 'CorosMcpError'
    this.code = code
  }
}

const unavailable = () => new CorosMcpError('COROS_UPSTREAM_UNAVAILABLE', 'COROS 数据服务暂时不可用，请稍后重试。')
const invalidData = () => new CorosMcpError('COROS_INVALID_DATA', 'COROS 返回的数据格式暂不支持，未导入任何数据。请稍后重试。')
const reconnect = () => new CorosMcpError('COROS_RECONNECT_REQUIRED', 'COROS 授权已失效，请重新连接。')
const MAX_RESPONSE_BYTES = 262_144
const REQUEST_TIMEOUT_MS = 25_000
const PROTOCOL_VERSION = '2025-06-18'
const SUPPORTED_PROTOCOLS = new Set([PROTOCOL_VERSION, '2025-03-26'])
const OFFICIAL_HOSTS = new Set(['mcp.coros.com', 'mcpcn.coros.com', 'mcpeu.coros.com', 'mcpus.coros.com'])
const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const assertEndpoint = (endpoint: string) => {
  let url: URL
  try { url = new URL(endpoint) } catch { throw unavailable() }
  if (url.protocol !== 'https:' || !OFFICIAL_HOSTS.has(url.hostname) || url.port || url.username || url.password ||
    url.pathname !== '/mcp' || url.search || url.hash) throw unavailable()
}

const rpcResult = (message: unknown, id: number): Record<string, unknown> | null => {
  if (!isObject(message) || message.jsonrpc !== '2.0') throw invalidData()
  if (message.id !== id) return null
  if ('error' in message) throw unavailable()
  if (!isObject(message.result)) throw invalidData()
  return message.result
}

// Read incrementally: an SSE server may keep its stream open after the matching
// response. Stop at that response, rather than waiting for the connection to end.
export const readMcpResponse = async (response: Response, id: number, signal: AbortSignal) => {
  if (response.status === 401 || response.status === 403) {
    await response.body?.cancel()
    throw reconnect()
  }
  if (!response.ok) {
    await response.body?.cancel()
    throw unavailable()
  }
  const type = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()
  if (!['application/json', 'text/event-stream'].includes(type ?? '') || !response.body ||
    Number(response.headers.get('content-length') ?? 0) > MAX_RESPONSE_BYTES) {
    await response.body?.cancel()
    throw invalidData()
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let bytes = 0
  let buffer = ''
  const abortRead = () => { void reader.cancel().catch(() => {}) }
  signal.addEventListener('abort', abortRead, { once: true })

  const parseJson = (text: string) => {
    let message: unknown
    try { message = JSON.parse(text) } catch { throw invalidData() }
    return rpcResult(message, id)
  }
  const parseEvent = (event: string) => {
    const data = event.split(/\r?\n/).filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).replace(/^ /, '')).join('\n')
    return data ? parseJson(data) : null
  }

  try {
    while (true) {
      signal.throwIfAborted()
      const { value, done } = await reader.read()
      signal.throwIfAborted()
      if (value) {
        bytes += value.byteLength
        if (bytes > MAX_RESPONSE_BYTES) throw invalidData()
        buffer += decoder.decode(value, { stream: true })
      }
      if (done) buffer += decoder.decode()
      if (type === 'text/event-stream') {
        let boundary: RegExpExecArray | null
        while ((boundary = /\r?\n\r?\n/.exec(buffer)) !== null) {
          const result = parseEvent(buffer.slice(0, boundary.index))
          buffer = buffer.slice(boundary.index + boundary[0].length)
          if (result) return result
        }
        if (done && buffer.trim()) {
          const result = parseEvent(buffer)
          if (result) return result
        }
      } else if (done) {
        const result = parseJson(buffer)
        if (result) return result
      }
      if (done) throw invalidData()
    }
  } finally {
    signal.removeEventListener('abort', abortRead)
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

type PreviewOptions = { accessToken: string; endpoint: string; signal: AbortSignal }

export const fetchCorosPreview = async ({ accessToken, endpoint, signal }: PreviewOptions) => {
  signal.throwIfAborted()
  assertEndpoint(endpoint)
  if (!accessToken || /\s/.test(accessToken)) throw reconnect()
  const combinedSignal = AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)])
  const headers = new Headers({
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  })
  const post = (body: unknown) => fetch(endpoint, {
    method: 'POST', headers, body: JSON.stringify(body), signal: combinedSignal,
    redirect: 'error', cache: 'no-store',
  })
  const call = async (id: number, method: string, params: unknown) => {
    const response = await post({ jsonrpc: '2.0', id, method, params })
    return readMcpResponse(response, id, combinedSignal)
  }

  try {
    const response = await post({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'EasyFitness', version: '1.0.0' } },
    })
    const initialized = await readMcpResponse(response, 1, combinedSignal)
    if (typeof initialized.protocolVersion !== 'string' || !SUPPORTED_PROTOCOLS.has(initialized.protocolVersion)) throw unavailable()
    headers.set('MCP-Protocol-Version', initialized.protocolVersion)
    const session = response.headers.get('mcp-session-id')
    if (session) {
      if (!/^[\x21-\x7e]{1,512}$/.test(session)) throw invalidData()
      headers.set('Mcp-Session-Id', session)
    }
    const notification = await post({ jsonrpc: '2.0', method: 'notifications/initialized' })
    await notification.body?.cancel()
    if (notification.status === 401 || notification.status === 403) throw reconnect()
    if (!notification.ok) throw unavailable()

    const results = await Promise.allSettled([
      call(2, 'tools/call', { name: 'queryDailyHealthData', arguments: { days: 7 } }),
      call(3, 'tools/call', { name: 'querySleepOverview', arguments: { days: 7 } }),
    ])
    combinedSignal.throwIfAborted()
    for (const result of results) {
      if (result.status === 'rejected' && result.reason instanceof CorosMcpError && result.reason.code === 'COROS_RECONNECT_REQUIRED') throw result.reason
    }
    const preview = parseCorosPreview(
      results[0].status === 'fulfilled' ? results[0].value : null,
      results[1].status === 'fulfilled' ? results[1].value : null,
    )
    if (preview.days.length === 0) {
      if (results.every((result) => result.status === 'rejected')) throw unavailable()
      throw new CorosMcpError('COROS_INVALID_DATA', '最近 7 天没有可识别的睡眠或活动热量。请先将手表同步到 COROS；若已有数据，可能是返回格式暂不支持。')
    }
    return preview
  } catch (error) {
    if (signal.aborted) signal.throwIfAborted()
    if (error instanceof CorosMcpError) throw error
    throw unavailable()
  }
}
