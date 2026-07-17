import { AiServiceError } from '../_lib/deepseek.js'
import { errorResponse, HttpRequestError, jsonResponse } from '../_lib/http.js'
import { generatePeriodSummaryWithDeepSeek } from '../_lib/periodSummary.js'
import { parsePeriodSummaryRequest } from '../_lib/periodSummaryHttp.js'

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
      feature: 'period_summary',
    }),
  )
}

const handleRequest = async (request: Request) => {
  const requestId = crypto.randomUUID()
  const startedAt = Date.now()

  try {
    const metrics = await parsePeriodSummaryRequest(request)
    if ((process.env.AI_FEATURE_ENABLED ?? '').toLowerCase() !== 'true') {
      return errorResponse(503, 'AI_DISABLED', 'AI 阶段总结功能当前未启用。')
    }

    const result = await generatePeriodSummaryWithDeepSeek(metrics, request.signal)
    logResult({
      requestId,
      startedAt,
      category: 'success',
      retried: result.retried,
    })
    return jsonResponse({ summary: result.summary })
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

    logResult({ requestId, startedAt, category: 'unexpected', retried: false })
    return errorResponse(500, 'AI_UPSTREAM_ERROR', '服务暂时不可用，请稍后再试。')
  }
}

export default {
  fetch: handleRequest,
}
