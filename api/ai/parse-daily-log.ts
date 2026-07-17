import { AiServiceError, parseDailyLogWithDeepSeek } from '../_lib/deepseek.js'
import {
  errorResponse,
  HttpRequestError,
  jsonResponse,
  parseDailyLogRequest,
} from '../_lib/http.js'

const logResult = (details: {
  requestId: string
  startedAt: number
  category: string
  upstreamStatus?: number
  retried: boolean
}) => {
  console.info(
    JSON.stringify({
      requestId: details.requestId,
      time: new Date().toISOString(),
      elapsedMs: Date.now() - details.startedAt,
      category: details.category,
      upstreamStatus: details.upstreamStatus,
      retried: details.retried,
    }),
  )
}

const handleRequest = async (request: Request) => {
  const requestId = crypto.randomUUID()
  const startedAt = Date.now()

  try {
    const { text, targetDate } = await parseDailyLogRequest(request)

    if ((process.env.AI_FEATURE_ENABLED ?? '').toLowerCase() !== 'true') {
      return errorResponse(503, 'AI_DISABLED', 'AI 自然语言记录功能当前未启用。')
    }

    const result = await parseDailyLogWithDeepSeek(text, targetDate, request.signal)
    logResult({
      requestId,
      startedAt,
      category: 'success',
      retried: result.retried,
    })
    return jsonResponse({ draft: result.draft })
  } catch (error) {
    if (error instanceof HttpRequestError) {
      return errorResponse(error.status, error.code, error.message)
    }
    if (error instanceof AiServiceError) {
      logResult({
        requestId,
        startedAt,
        category: error.category,
        upstreamStatus: error.upstreamStatus,
        retried: error.retried,
      })
      return errorResponse(error.status, error.code, error.message)
    }

    logResult({
      requestId,
      startedAt,
      category: 'unexpected',
      retried: false,
    })
    return errorResponse(500, 'AI_UPSTREAM_ERROR', '服务暂时不可用，请稍后再试。')
  }
}

export default {
  fetch: handleRequest,
}
