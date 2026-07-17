import type { AiApiErrorBody, AiDailyDraft } from './types.ts'
import { parseAiDraftApiResponse } from './validation.ts'

export class NaturalLogRequestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NaturalLogRequestError'
  }
}

const fallbackMessage = '暂时无法整理这段记录，请稍后再试。'

const errorMessages: Partial<Record<AiApiErrorBody['code'], string>> = {
  INVALID_REQUEST: '输入内容或日期不正确，请检查后重试。',
  METHOD_NOT_ALLOWED: '整理请求方式不正确。',
  UNSUPPORTED_MEDIA_TYPE: '整理请求格式不正确。',
  AI_DISABLED: 'AI 自然语言记录功能当前未启用。',
  AI_NOT_CONFIGURED: 'AI 服务尚未配置。',
  AI_TIMEOUT: '整理超时，请重试。',
  AI_RATE_LIMITED: '当前请求较多，请稍后再试。',
  AI_UPSTREAM_ERROR: 'AI 服务暂时不可用，请稍后再试。',
  AI_INVALID_RESPONSE: 'AI 返回格式异常，请重新整理。',
  AI_CONTENT_REJECTED: '这段内容暂时无法整理，请调整表述后重试。',
}

export const requestNaturalLogDraft = async (
  text: string,
  targetDate: string,
  signal: AbortSignal,
): Promise<AiDailyDraft> => {
  let response: Response
  try {
    response = await fetch('/api/ai/parse-daily-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, targetDate }),
      signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error
    }
    throw new NaturalLogRequestError('无法连接整理服务，请检查网络后重试。')
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new NaturalLogRequestError(fallbackMessage)
  }

  if (!response.ok) {
    const apiError = payload as Partial<AiApiErrorBody>
    throw new NaturalLogRequestError(
      typeof apiError.code === 'string' && apiError.code in errorMessages
        ? errorMessages[apiError.code as AiApiErrorBody['code']] ?? fallbackMessage
        : fallbackMessage,
    )
  }

  try {
    return parseAiDraftApiResponse(payload, targetDate)
  } catch {
    throw new NaturalLogRequestError('整理结果格式异常，请重新整理。')
  }
}
