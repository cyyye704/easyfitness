import type { AiApiErrorBody, AiDailyDraft } from './types.ts'
import { parseAiDraftApiResponse } from './validation.ts'
import { requestAiJson } from './request.js'

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

export const requestNaturalLogDraft = (
  text: string,
  targetDate: string,
  signal: AbortSignal,
  userId?: string,
): Promise<AiDailyDraft> =>
  requestAiJson({
    endpoint: '/api/ai/parse-daily-log',
    body: { text, targetDate },
    signal,
    userId,
    parseResponse: (payload) => parseAiDraftApiResponse(payload, targetDate),
    messages: {
      network: '无法连接整理服务，请检查网络后重试。',
      fallback: '暂时无法整理这段记录，请稍后再试。',
      invalidResponse: '整理结果格式异常，请重新整理。',
      codes: errorMessages,
    },
  })
