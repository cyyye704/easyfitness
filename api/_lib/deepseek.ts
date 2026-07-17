import type { AiDailyDraft, AiApiErrorCode } from '../../src/ai/types.ts'
import {
  DeepSeekResponseError,
  parseDeepSeekCompletion,
} from '../../src/ai/validation.ts'
import { buildDeepSeekUserPrompt, DEEPSEEK_SYSTEM_PROMPT } from './deepseekPrompt.ts'

const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions'
const DEFAULT_MODEL = 'deepseek-v4-flash'
const OVERALL_TIMEOUT_MS = 25_000

type SafeLogCategory =
  | 'success'
  | 'upstream_http'
  | 'upstream_network'
  | 'invalid_response'
  | 'timeout'
  | 'client_abort'

export class AiServiceError extends Error {
  status: number
  code: AiApiErrorCode
  category: SafeLogCategory
  upstreamStatus?: number
  retried: boolean

  constructor(
    status: number,
    code: AiApiErrorCode,
    message: string,
    category: SafeLogCategory,
    options: { upstreamStatus?: number; retried?: boolean } = {},
  ) {
    super(message)
    this.name = 'AiServiceError'
    this.status = status
    this.code = code
    this.category = category
    this.upstreamStatus = options.upstreamStatus
    this.retried = options.retried ?? false
  }
}

const shouldRetryParseError = (error: DeepSeekResponseError) =>
  error.kind === 'empty_content' ||
  error.kind === 'invalid_json' ||
  error.kind === 'invalid_structure' ||
  error.kind === 'length'

const parseErrorToServiceError = (
  error: DeepSeekResponseError,
  retried: boolean,
) => {
  if (error.kind === 'content_filter') {
    return new AiServiceError(
      422,
      'AI_CONTENT_REJECTED',
      '这段内容暂时无法整理，请调整表述后重试。',
      'invalid_response',
      { retried },
    )
  }

  if (error.kind === 'insufficient_system_resource') {
    return new AiServiceError(
      502,
      'AI_UPSTREAM_ERROR',
      'AI 服务暂时繁忙，请稍后再试。',
      'upstream_http',
      { retried },
    )
  }

  if (error.kind === 'unexpected_finish_reason') {
    return new AiServiceError(
      502,
      'AI_UPSTREAM_ERROR',
      'AI 服务暂时不可用，请稍后再试。',
      'upstream_http',
      { retried },
    )
  }

  return new AiServiceError(
    502,
    'AI_INVALID_RESPONSE',
    'AI 返回的内容无法安全整理，请重试。',
    'invalid_response',
    { retried },
  )
}

const upstreamStatusError = (status: number, retried: boolean) => {
  if (status === 401) {
    return new AiServiceError(
      502,
      'AI_NOT_CONFIGURED',
      'AI 服务配置异常，请联系维护者。',
      'upstream_http',
      { upstreamStatus: status, retried },
    )
  }

  if (status === 402) {
    return new AiServiceError(
      503,
      'AI_UPSTREAM_ERROR',
      'AI 服务额度暂不可用，请稍后再试。',
      'upstream_http',
      { upstreamStatus: status, retried },
    )
  }

  if (status === 429) {
    return new AiServiceError(
      429,
      'AI_RATE_LIMITED',
      'AI 请求过于频繁，请稍后再试。',
      'upstream_http',
      { upstreamStatus: status, retried },
    )
  }

  return new AiServiceError(
    502,
    'AI_UPSTREAM_ERROR',
    'AI 服务暂时不可用，请稍后再试。',
    'upstream_http',
    { upstreamStatus: status, retried },
  )
}

const createLinkedAbortController = (requestSignal: AbortSignal) => {
  const controller = new AbortController()
  const abortFromRequest = () => controller.abort(requestSignal.reason)
  if (requestSignal.aborted) {
    abortFromRequest()
  } else {
    requestSignal.addEventListener('abort', abortFromRequest, { once: true })
  }
  return { controller, detach: () => requestSignal.removeEventListener('abort', abortFromRequest) }
}

export const parseDailyLogWithDeepSeek = async (
  text: string,
  targetDate: string,
  requestSignal: AbortSignal,
): Promise<{ draft: AiDailyDraft; retried: boolean }> => {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) {
    throw new AiServiceError(
      503,
      'AI_NOT_CONFIGURED',
      'AI 服务尚未配置。',
      'upstream_http',
    )
  }

  const { controller, detach } = createLinkedAbortController(requestSignal)
  let didTimeout = false
  const timeout = setTimeout(() => {
    didTimeout = true
    controller.abort('overall-timeout')
  }, OVERALL_TIMEOUT_MS)

  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const retried = attempt === 1
      let response: Response
      try {
        response = await fetch(DEEPSEEK_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: process.env.DEEPSEEK_MODEL?.trim() || DEFAULT_MODEL,
            messages: [
              { role: 'system', content: DEEPSEEK_SYSTEM_PROMPT },
              { role: 'user', content: buildDeepSeekUserPrompt(text, targetDate) },
            ],
            response_format: { type: 'json_object' },
            thinking: { type: 'disabled' },
            temperature: 0.1,
            max_tokens: 2500,
            stream: false,
          }),
          signal: controller.signal,
        })
      } catch {
        if (didTimeout) {
          throw new AiServiceError(
            504,
            'AI_TIMEOUT',
            'AI 整理超时，请稍后重试。',
            'timeout',
            { retried },
          )
        }
        if (requestSignal.aborted) {
          throw new AiServiceError(
            499,
            'AI_UPSTREAM_ERROR',
            '请求已取消。',
            'client_abort',
            { retried },
          )
        }
        throw new AiServiceError(
          502,
          'AI_UPSTREAM_ERROR',
          '无法连接 AI 服务，请稍后再试。',
          'upstream_network',
          { retried },
        )
      }

      if (!response.ok) {
        if (response.status >= 500 && attempt === 0) {
          continue
        }
        throw upstreamStatusError(response.status, retried)
      }

      let payload: unknown
      try {
        payload = await response.json()
      } catch {
        if (didTimeout) {
          throw new AiServiceError(
            504,
            'AI_TIMEOUT',
            'AI 整理超时，请稍后重试。',
            'timeout',
            { retried },
          )
        }
        if (attempt === 0) {
          continue
        }
        throw new AiServiceError(
          502,
          'AI_INVALID_RESPONSE',
          'AI 返回的内容无法安全整理，请重试。',
          'invalid_response',
          { retried },
        )
      }

      try {
        return { draft: parseDeepSeekCompletion(payload, targetDate), retried }
      } catch (error) {
        if (error instanceof DeepSeekResponseError) {
          if (attempt === 0 && shouldRetryParseError(error)) {
            continue
          }
          throw parseErrorToServiceError(error, retried)
        }
        throw error
      }
    }

    throw new AiServiceError(
      502,
      'AI_INVALID_RESPONSE',
      'AI 返回的内容无法安全整理，请重试。',
      'invalid_response',
      { retried: true },
    )
  } finally {
    clearTimeout(timeout)
    detach()
  }
}
