import type { AiApiErrorBody } from '../ai/types.js'
import type { UserProfileDraft } from './types.js'
import { parseProfileApiResponse } from './validation.js'

export class ProfileRequestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProfileRequestError'
  }
}

const fallbackMessage = '暂时无法整理个人基线，请稍后再试。'

const errorMessages: Partial<Record<AiApiErrorBody['code'], string>> = {
  INVALID_REQUEST: '个人描述格式不正确，请检查后重试。',
  METHOD_NOT_ALLOWED: '个人档案请求方式不正确。',
  UNSUPPORTED_MEDIA_TYPE: '个人档案请求格式不正确。',
  AI_DISABLED: 'AI 个人档案功能当前未启用。',
  AI_NOT_CONFIGURED: 'AI 服务尚未配置。',
  AI_TIMEOUT: '个人信息整理超时，请重试。',
  AI_RATE_LIMITED: '当前请求较多，请稍后再试。',
  AI_UPSTREAM_ERROR: 'AI 服务暂时不可用，请稍后再试。',
  AI_INVALID_RESPONSE: 'AI 返回的个人档案格式异常，请重试。',
  AI_CONTENT_REJECTED: '这段内容暂时无法整理，请调整表述后重试。',
}

export const requestProfileDraft = async (
  text: string,
  signal: AbortSignal,
): Promise<UserProfileDraft> => {
  let response: Response
  try {
    response = await fetch('/api/ai/parse-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error
    }
    throw new ProfileRequestError('无法连接个人档案服务，请检查网络后重试。')
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new ProfileRequestError(fallbackMessage)
  }

  if (!response.ok) {
    const apiError = payload as Partial<AiApiErrorBody>
    throw new ProfileRequestError(
      typeof apiError.code === 'string' && apiError.code in errorMessages
        ? errorMessages[apiError.code as AiApiErrorBody['code']] ?? fallbackMessage
        : fallbackMessage,
    )
  }

  try {
    return parseProfileApiResponse(payload)
  } catch {
    throw new ProfileRequestError('个人档案整理结果格式异常，请重新整理。')
  }
}
