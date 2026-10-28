import type { AiApiErrorBody } from '../ai/types.js'
import type { PeriodAiSummary, PeriodSummaryMetrics } from './types.js'
import { parsePeriodSummaryApiResponse } from './validation.js'
import { requestAiJson } from '../ai/request.js'

const errorMessages: Partial<Record<AiApiErrorBody['code'], string>> = {
  INVALID_REQUEST: '阶段数据格式不正确，请刷新后重试。',
  METHOD_NOT_ALLOWED: '阶段总结请求方式不正确。',
  UNSUPPORTED_MEDIA_TYPE: '阶段总结请求格式不正确。',
  AI_DISABLED: 'AI 阶段总结功能当前未启用。',
  AI_NOT_CONFIGURED: 'AI 服务尚未配置。',
  AI_TIMEOUT: '阶段小结生成超时，请重试。',
  AI_RATE_LIMITED: '当前请求较多，请稍后再试。',
  AI_UPSTREAM_ERROR: 'AI 服务暂时不可用，请稍后再试。',
  AI_INVALID_RESPONSE: 'AI 返回的小结格式异常，请重试。',
  AI_CONTENT_REJECTED: '这组阶段数据暂时无法生成小结。',
}

export const requestPeriodAiSummary = (
  metrics: PeriodSummaryMetrics,
  signal: AbortSignal,
  userId?: string,
): Promise<PeriodAiSummary> =>
  requestAiJson({
    endpoint: '/api/ai/summarize-period',
    body: { metrics },
    signal,
    userId,
    parseResponse: (payload) => parsePeriodSummaryApiResponse(payload).summary,
    messages: {
      network: '无法连接阶段总结服务，请检查网络后重试。',
      fallback: '暂时无法生成阶段小结，请稍后再试。',
      invalidResponse: '阶段小结格式异常，请重新生成。',
      codes: errorMessages,
    },
  })
