import { CorosError, isTokenString } from './http.js'

export type CorosRegion = 'auto' | 'cn' | 'eu' | 'us'
export type CorosConfig = { origin: string; secret: Buffer; secure: boolean; clientId?: string }
export const regionOrigins: Record<CorosRegion, string> = {
  auto: 'https://mcp.coros.com',
  cn: 'https://mcpcn.coros.com',
  eu: 'https://mcpeu.coros.com',
  us: 'https://mcpus.coros.com',
}

export const isRegion = (value: unknown): value is CorosRegion =>
  typeof value === 'string' && Object.hasOwn(regionOrigins, value)

const configurationError = () => new CorosError(
  503, 'COROS_NOT_CONFIGURED', 'COROS 连接尚未配置，请按部署说明完成服务端配置。',
)

export const getCorosConfig = (): CorosConfig => {
  const originValue = process.env.COROS_APP_ORIGIN?.trim()
  const secretValue = process.env.COROS_COOKIE_SECRET?.trim()
  if (!originValue || !secretValue || !/^[A-Za-z0-9+/]{43}=$/.test(secretValue)) throw configurationError()
  const secret = Buffer.from(secretValue, 'base64')
  if (secret.length !== 32 || secret.toString('base64') !== secretValue) throw configurationError()
  let url: URL
  try { url = new URL(originValue) } catch { throw configurationError() }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (
    (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) ||
    url.username || url.password || url.search || url.hash || url.pathname !== '/'
  ) throw configurationError()
  const clientId = process.env.COROS_CLIENT_ID?.trim() || undefined
  if (clientId && !isTokenString(clientId, 512)) throw configurationError()
  return { origin: url.origin, secret, secure: url.protocol === 'https:', clientId }
}

// Do not trust discovery metadata (or a request parameter) to choose credential destinations.
export const officialUrl = (value: unknown, path?: string): string => {
  if (typeof value !== 'string') throw configurationError()
  let url: URL
  try { url = new URL(value) } catch { throw configurationError() }
  if (
    !Object.values(regionOrigins).includes(url.origin) ||
    url.username || url.password || url.search || url.hash || (path && url.pathname !== path)
  ) throw configurationError()
  return url.href
}

export const assertAppRequest = (request: Request, config: CorosConfig) => {
  const origin = request.headers.get('origin')
  const fetchSite = request.headers.get('sec-fetch-site')
  if (
    new URL(request.url).origin !== config.origin ||
    (origin && origin !== config.origin) ||
    (request.method === 'POST' && fetchSite && !['same-origin', 'none'].includes(fetchSite))
  ) throw new CorosError(403, 'INVALID_REQUEST', '请求来源不受信任。')
}
