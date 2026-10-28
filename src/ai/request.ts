import { supabase, supabaseConfigError } from '../auth/supabase.js'
import type { AiApiErrorBody } from './types.js'

export class AiRequestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AiRequestError'
  }
}

type AiRequestOptions<T> = {
  userId?: string
  endpoint: string
  body: unknown
  signal: AbortSignal
  parseResponse: (payload: unknown) => T
  messages: {
    network: string
    fallback: string
    invalidResponse: string
    codes: Partial<Record<AiApiErrorBody['code'], string>>
  }
}

const isAbortError = (error: unknown) =>
  error instanceof Error && error.name === 'AbortError'

export const requestAiJson = async <T>({
  userId,
  endpoint,
  body,
  signal,
  parseResponse,
  messages,
}: AiRequestOptions<T>): Promise<T> => {
  signal.throwIfAborted()
  if (supabaseConfigError) throw new AiRequestError(supabaseConfigError)
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (supabase) {
    const { data, error } = await supabase.auth.getSession()
    signal.throwIfAborted()
    if (error || !data.session || (userId && data.session.user.id !== userId)) {
      throw new AiRequestError('登录状态已变化，请重新登录后再试。')
    }
    headers.Authorization = `Bearer ${data.session.access_token}`
  }
  let response: Response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    })
  } catch (error) {
    if (isAbortError(error)) {
      throw error
    }
    throw new AiRequestError(messages.network)
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch (error) {
    if (isAbortError(error)) {
      throw error
    }
    throw new AiRequestError(messages.fallback)
  }

  if (!response.ok) {
    const code =
      payload !== null &&
      typeof payload === 'object' &&
      Object.hasOwn(payload, 'code') &&
      'code' in payload
        ? payload.code
        : undefined
    const authMessages: Partial<Record<AiApiErrorBody['code'], string>> = {
      AUTH_REQUIRED: '请先登录后再使用 AI 功能。',
      AUTH_NOT_CONFIGURED: '登录验证服务尚未配置。',
      AUTH_UNAVAILABLE: '登录验证服务暂时不可用，请稍后重试。',
    }
    const message =
      typeof code === 'string' && Object.hasOwn(messages.codes, code)
        ? messages.codes[code as AiApiErrorBody['code']]
        : undefined
    const authMessage = typeof code === 'string' && Object.hasOwn(authMessages, code)
      ? authMessages[code as AiApiErrorBody['code']] : undefined
    throw new AiRequestError(message ?? authMessage ?? messages.fallback)
  }

  try {
    return parseResponse(payload)
  } catch {
    throw new AiRequestError(messages.invalidResponse)
  }
}
