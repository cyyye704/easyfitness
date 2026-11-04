import { supabase } from '../auth/supabase.js'
import { isObject } from '../data/validation.js'
import type { CorosRegion } from './types.js'
import { parseCorosAuthorization, parseCorosPreview, parseCorosStatus } from './validation.js'

type Session = { user: { id: string }; access_token: string }
type ClientDependencies = { getSession: () => Promise<Session | null>; fetcher?: typeof fetch }

export class CorosRequestError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'CorosRequestError'
    this.code = code
  }
}

const errorMessages: Record<string, string> = {
  AUTH_REQUIRED: '登录状态已变化，请重新登录后再连接 COROS。',
  AUTH_NOT_CONFIGURED: '登录验证服务尚未配置。',
  AUTH_UNAVAILABLE: '登录验证暂时不可用，请稍后重试。',
  COROS_NOT_CONFIGURED: 'COROS 连接尚未配置，请按部署说明设置服务端环境变量。',
  COROS_NOT_CONNECTED: '请先连接 COROS。',
  COROS_RECONNECT_REQUIRED: 'COROS 授权已失效，请重新连接。',
  COROS_RATE_LIMITED: '操作过于频繁，请稍后重试。',
  COROS_TIMEOUT: 'COROS 响应超时，请稍后重试。',
  COROS_UNAVAILABLE: '暂时无法连接 COROS，请稍后重试。',
  COROS_UPSTREAM_UNAVAILABLE: '暂时无法连接 COROS，请稍后重试。',
  COROS_INVALID_RESPONSE: 'COROS 数据格式暂不支持，请稍后重试。',
  COROS_DATA_UNRECOGNIZED: 'COROS 返回的数据格式暂不支持，本次未导入。请稍后重试。',
  COROS_INVALID_DATA: 'COROS 返回的数据格式暂不支持，本次未导入。请稍后重试。',
  COROS_CONNECTION_TOO_LARGE: 'COROS 授权数据过大，暂时无法保存连接。',
}

// Separate from AI requests: COROS is a deterministic, authenticated data source.
export const createCorosClient = ({ getSession, fetcher = (...args) => fetch(...args) }: ClientDependencies) => {
  const performRequest = async <T>(userId: string, body: unknown, signal: AbortSignal, parse: (value: unknown) => T) => {
    signal.throwIfAborted()
    const session = await getSession()
    signal.throwIfAborted()
    if (!session || session.user.id !== userId) throw new Error(errorMessages.AUTH_REQUIRED)
    let response: Response
    try {
      response = await fetcher('/api/coros', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(body), signal,
      })
    } catch {
      signal.throwIfAborted()
      throw new Error('无法连接 COROS 服务，请检查网络后重试。')
    }
    let payload: unknown
    try { payload = await response.json() } catch {
      signal.throwIfAborted()
      throw new Error('COROS 服务未正常响应。请确认已启用服务端接口后重试。')
    }
    signal.throwIfAborted()
    const current = await getSession()
    signal.throwIfAborted()
    if (current?.user.id !== userId) throw new Error(errorMessages.AUTH_REQUIRED)
    if (!response.ok) {
      const code = isObject(payload) && typeof payload.code === 'string' ? payload.code : ''
      throw new CorosRequestError(code, Object.hasOwn(errorMessages, code) ? errorMessages[code] : 'COROS 操作失败，请稍后重试。')
    }
    return parse(payload)
  }
  const request = <T>(userId: string, body: unknown, signal: AbortSignal, parse: (value: unknown) => T) => {
    const execute = () => performRequest(userId, body, signal, parse)
    // Cookies are shared by tabs. Serializing also prevents two near-expiry
    // previews from rotating the same refresh token at the same time.
    if (typeof navigator !== 'undefined' && navigator.locks) {
      return navigator.locks.request('easyfitness:coros', { signal }, execute)
    }
    return execute()
  }
  return {
    status: (userId: string, signal: AbortSignal) => request(userId, { action: 'status' }, signal, parseCorosStatus),
    connect: (userId: string, region: CorosRegion, signal: AbortSignal) =>
      request(userId, { action: 'connect', region }, signal, parseCorosAuthorization),
    preview: (userId: string, signal: AbortSignal) => request(userId, { action: 'preview' }, signal, parseCorosPreview),
    disconnect: (userId: string, signal: AbortSignal) =>
      request(userId, { action: 'disconnect' }, signal, () => undefined),
  }
}

export const corosClient = createCorosClient({
  getSession: async () => {
    if (!supabase) return null
    const { data, error } = await supabase.auth.getSession()
    if (error) throw new Error(errorMessages.AUTH_REQUIRED)
    return data.session
  },
})
