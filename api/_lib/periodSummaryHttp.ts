import { normalizePeriodSummaryMetrics } from '../../src/periodSummary/validation.js'
import { HttpRequestError, parseJsonObjectRequest } from './http.js'

const PERIOD_SUMMARY_REQUEST_MAX_BYTES = 12 * 1024

export const parsePeriodSummaryRequest = async (request: Request) => {
  const body = await parseJsonObjectRequest(
    request,
    PERIOD_SUMMARY_REQUEST_MAX_BYTES,
  )
  if (!('metrics' in body)) {
    throw new HttpRequestError(400, 'INVALID_REQUEST', 'metrics 为必填字段。')
  }

  try {
    return normalizePeriodSummaryMetrics(body.metrics)
  } catch {
    throw new HttpRequestError(400, 'INVALID_REQUEST', '阶段统计数据格式不正确。')
  }
}
