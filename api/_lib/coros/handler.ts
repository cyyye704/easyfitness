import { createHash } from 'node:crypto'
import { requireAuthenticatedUser } from '../auth.js'
import { HttpRequestError, parseJsonObjectRequest } from '../http.js'
import { assertAppRequest, getCorosConfig, isRegion, officialUrl, type CorosConfig } from './config.js'
import { clearCorosCookies, CONNECTION_SECONDS, FLOW_SECONDS, readCookie, sealCookie } from './cookies.js'
import { CorosError, corosJson, reconnectError } from './http.js'
import { CorosMcpError, fetchCorosPreview } from './mcp.js'
import {
  finishAuthorization, refreshConnection, revokeConnection, startAuthorization, validState,
  type CorosConnection, type CorosFlow,
} from './oauth.js'

type PreviewReader = typeof fetchCorosPreview
const buckets = new Map<string, { count: number; expires: number }>()

// Best-effort per-instance protection, in addition to verified login and a fixed seven-day query.
// A distributed rate limiter is deliberately not introduced into this small integration.
const enforceRate = (userId: string, action: string) => {
  const now = Date.now()
  for (const [key, bucket] of buckets) if (bucket.expires <= now) buckets.delete(key)
  if (buckets.size >= 5_000) throw new CorosError(429, 'COROS_RATE_LIMITED', '请求较多，请稍后重试。')
  const key = createHash('sha256').update(`${userId}:${action}`).digest('hex')
  const bucket = buckets.get(key) ?? { count: 0, expires: now + (action === 'connect' ? 3_600_000 : 60_000) }
  if (bucket.count >= (action === 'connect' ? 8 : 12)) {
    throw new CorosError(429, 'COROS_RATE_LIMITED', 'COROS 请求过于频繁，请稍后重试。')
  }
  bucket.count += 1
  buckets.set(key, bucket)
}

const commonCookieFields = (data: Record<string, unknown>) => {
  if (
    typeof data.userId !== 'string' || !data.userId || typeof data.clientId !== 'string' || !data.clientId ||
    !isRegion(data.region)
  ) return null
  try {
    const endpoint = officialUrl(data.endpoint, '/mcp')
    const tokenEndpoint = officialUrl(data.tokenEndpoint, '/oauth2/token')
    const revocationEndpoint = officialUrl(data.revocationEndpoint, '/oauth2/revoke')
    if ([tokenEndpoint, revocationEndpoint].some((url) => new URL(url).origin !== new URL(endpoint).origin)) return null
    return { userId: data.userId, clientId: data.clientId, region: data.region, endpoint, tokenEndpoint, revocationEndpoint }
  } catch { return null }
}

const readFlow = (request: Request, config: CorosConfig): CorosFlow | null => {
  const data = readCookie('flow', request, config)
  if (!data || typeof data.state !== 'string' || typeof data.verifier !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(data.verifier)) return null
  const common = commonCookieFields(data)
  return common ? { ...common, state: data.state, verifier: data.verifier } : null
}

const readConnection = (request: Request, config: CorosConfig): CorosConnection | null => {
  const data = readCookie('connection', request, config)
  if (
    !data || typeof data.accessToken !== 'string' || !data.accessToken ||
    typeof data.expiresAt !== 'number' || !Number.isFinite(data.expiresAt) ||
    (data.refreshToken !== undefined && typeof data.refreshToken !== 'string')
  ) return null
  const common = commonCookieFields(data)
  return common ? {
    ...common, accessToken: data.accessToken, expiresAt: data.expiresAt,
    ...(typeof data.refreshToken === 'string' ? { refreshToken: data.refreshToken } : {}),
  } : null
}

const connectionCookies = (connection: CorosConnection, config: CorosConfig) => sealCookie(
  'connection', connection, config,
  connection.refreshToken ? CONNECTION_SECONDS : Math.max(0, (connection.expiresAt - Date.now()) / 1_000),
)

const callback = async (request: Request, config: CorosConfig): Promise<Response> => {
  const cookies = clearCorosCookies('flow', config)
  let outcome = 'error'
  try {
    const url = new URL(request.url)
    const flow = readFlow(request, config)
    const state = url.searchParams.get('state')
    if (!flow || !validState(state, flow.state) || url.searchParams.getAll('state').length !== 1) throw reconnectError()
    if (url.searchParams.has('error')) {
      outcome = 'cancelled'
    } else {
      const code = url.searchParams.get('code')
      if (!code || code.length > 2_048 || url.searchParams.getAll('code').length !== 1) throw reconnectError()
      const connection = await finishAuthorization(flow, code, config, request.signal)
      cookies.push(...connectionCookies(connection, config))
      outcome = 'connected'
    }
  } catch { /* Redirects contain only a fixed outcome; never reflect OAuth error/code/token data. */ }
  const headers = new Headers({
    Location: `${config.origin}/?coros=${outcome}`,
    'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
  })
  for (const cookie of cookies) headers.append('Set-Cookie', cookie)
  return new Response(null, { status: 303, headers })
}

export const createCorosHandler = (readPreview: PreviewReader = fetchCorosPreview) => async (request: Request): Promise<Response> => {
  let config: CorosConfig | undefined
  let rotatedCookies: string[] = []
  try {
    if (request.method === 'GET') {
      config = getCorosConfig()
      assertAppRequest(request, config)
      return await callback(request, config)
    }
    const body = await parseJsonObjectRequest(request, 2_048)
    const action = body.action
    if (!['status', 'connect', 'disconnect', 'preview'].includes(String(action))) {
      throw new CorosError(400, 'INVALID_REQUEST', '未知的 COROS 操作。')
    }
    const user = await requireAuthenticatedUser(request)
    try { config = getCorosConfig() } catch (error) {
      if (action === 'status' && error instanceof CorosError && error.code === 'COROS_NOT_CONFIGURED') {
        return corosJson({ configured: false, connected: false })
      }
      throw error
    }
    assertAppRequest(request, config)
    const stored = readConnection(request, config)
    const connection = stored?.userId === user.id ? stored : null

    if (action === 'status') {
      const connected = Boolean(connection && (connection.expiresAt > Date.now() || connection.refreshToken))
      return corosJson({ configured: true, connected, ...(connected && connection ? { region: connection.region } : {}) })
    }
    if (action === 'disconnect') {
      if (connection) await revokeConnection(connection, request.signal)
      return corosJson({ configured: true, connected: false }, 200, [
        ...clearCorosCookies('flow', config), ...clearCorosCookies('connection', config),
      ])
    }
    enforceRate(user.id, String(action))
    if (action === 'connect') {
      const region = body.region ?? 'auto'
      if (!isRegion(region)) throw new CorosError(400, 'INVALID_REQUEST', '请选择有效的 COROS 账号地区。')
      const { authorizationUrl, flow } = await startAuthorization(user.id, region, config, request.signal)
      return corosJson({ authorizationUrl }, 200, sealCookie('flow', flow, config, FLOW_SECONDS))
    }
    if (!connection) throw reconnectError()
    const active = connection.expiresAt <= Date.now() + 60_000
      ? await refreshConnection(connection, request.signal) : connection
    if (active !== connection) rotatedCookies = connectionCookies(active, config)
    const preview = await readPreview({ accessToken: active.accessToken, endpoint: active.endpoint, signal: request.signal })
    return corosJson(preview, 200, rotatedCookies)
  } catch (error) {
    if (error instanceof CorosMcpError) {
      if (error.code === 'COROS_RECONNECT_REQUIRED' && config) rotatedCookies = clearCorosCookies('connection', config)
      return corosJson({ code: error.code, error: error.message }, error.code === 'COROS_RECONNECT_REQUIRED' ? 401 : 502, rotatedCookies)
    }
    if (error instanceof CorosError || error instanceof HttpRequestError) {
      if (error.code === 'COROS_RECONNECT_REQUIRED' && config) rotatedCookies = clearCorosCookies('connection', config)
      return corosJson({ code: error.code, error: error.code === 'AUTH_REQUIRED' ? '请先登录后再连接 COROS。' : error.message }, error.status, rotatedCookies)
    }
    return corosJson({ code: 'COROS_UPSTREAM_UNAVAILABLE', error: 'COROS 服务暂时不可用，请稍后重试。' }, 502, rotatedCookies)
  }
}
