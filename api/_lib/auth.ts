import { HttpRequestError } from './http.js'

const AUTH_TIMEOUT_MS = 5_000

const authRequired = () =>
  new HttpRequestError(401, 'AUTH_REQUIRED', '请先登录后再使用 AI 功能。')

const authNotConfigured = () =>
  new HttpRequestError(503, 'AUTH_NOT_CONFIGURED', '登录验证服务尚未配置。')

const authUnavailable = () =>
  new HttpRequestError(503, 'AUTH_UNAVAILABLE', '登录验证服务暂时不可用，请稍后重试。')

const authCancelled = () =>
  new HttpRequestError(499, 'AUTH_UNAVAILABLE', '请求已取消。')

const getAuthConfig = () => {
  const baseUrl = process.env.SUPABASE_URL?.trim()
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY?.trim()
  if (!baseUrl || !publishableKey || !publishableKey.startsWith('sb_publishable_')) {
    throw authNotConfigured()
  }

  let url: URL
  try {
    url = new URL(baseUrl)
  } catch {
    throw authNotConfigured()
  }
  const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocal)) ||
    url.username || url.password || url.search || url.hash
  ) {
    throw authNotConfigured()
  }
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/auth/v1/user`
  return { url, publishableKey }
}

export const requireAuthenticatedUser = async (request: Request): Promise<void> => {
  const { url, publishableKey } = getAuthConfig()
  const authorization = request.headers.get('authorization') ?? ''
  const token = /^Bearer ([^\s,]+)$/i.exec(authorization)?.[1]
  if (!token) throw authRequired()
  if (request.signal.aborted) throw authCancelled()

  const controller = new AbortController()
  const abortFromRequest = () => controller.abort(request.signal.reason)
  request.signal.addEventListener('abort', abortFromRequest, { once: true })
  const timeout = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS)

  try {
    // Validate with Supabase Auth for every request; decoded JWT claims are not proof.
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
      redirect: 'error',
      cache: 'no-store',
    })
    if (response.status === 401 || response.status === 403) throw authRequired()
    if (!response.ok) throw authUnavailable()

    const user: unknown = await response.json()
    controller.signal.throwIfAborted()
    if (
      !user || typeof user !== 'object' || Array.isArray(user) ||
      !('id' in user) || typeof user.id !== 'string' || !user.id.trim() ||
      ('is_anonymous' in user && typeof user.is_anonymous !== 'boolean')
    ) {
      throw authUnavailable()
    }
    if ('is_anonymous' in user && user.is_anonymous) throw authRequired()
  } catch (error) {
    if (request.signal.aborted) throw authCancelled()
    if (error instanceof HttpRequestError) throw error
    throw authUnavailable()
  } finally {
    clearTimeout(timeout)
    request.signal.removeEventListener('abort', abortFromRequest)
  }
}
