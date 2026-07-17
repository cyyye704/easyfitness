import type { AiApiErrorBody, AiApiErrorCode } from '../../src/ai/types.js'
import { AI_REQUEST_MAX_BYTES, AI_TEXT_MAX_LENGTH } from '../../src/ai/types.js'
import { isDateKey } from '../../src/utils.js'

export type ParseDailyLogRequest = {
  text: string
  targetDate: string
}

export class HttpRequestError extends Error {
  status: number
  code: AiApiErrorCode

  constructor(status: number, code: AiApiErrorCode, message: string) {
    super(message)
    this.name = 'HttpRequestError'
    this.status = status
    this.code = code
  }
}

const jsonHeaders = {
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8',
}

export const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: jsonHeaders })

export const errorResponse = (
  status: number,
  code: AiApiErrorCode,
  error: string,
) => jsonResponse({ error, code } satisfies AiApiErrorBody, status)

const invalidRequest = (message: string): never => {
  throw new HttpRequestError(400, 'INVALID_REQUEST', message)
}

export const assertSameOrigin = (request: Request) => {
  const origin = request.headers.get('origin')
  if (!origin) {
    return
  }

  let requestOrigin = ''
  try {
    requestOrigin = new URL(request.url).origin
  } catch {
    invalidRequest('请求地址不合法。')
  }

  if (origin !== requestOrigin) {
    invalidRequest('请求来源不受信任。')
  }
}

export const parseDailyLogRequest = async (
  request: Request,
): Promise<ParseDailyLogRequest> => {
  if (request.method !== 'POST') {
    throw new HttpRequestError(
      405,
      'METHOD_NOT_ALLOWED',
      '此接口只接受 POST 请求。',
    )
  }

  const contentType = request.headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().startsWith('application/json')) {
    throw new HttpRequestError(
      415,
      'UNSUPPORTED_MEDIA_TYPE',
      '请使用 application/json 提交。',
    )
  }

  assertSameOrigin(request)

  const declaredLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > AI_REQUEST_MAX_BYTES) {
    invalidRequest('请求内容过大。')
  }

  const bytes = new Uint8Array(await request.arrayBuffer())
  if (bytes.byteLength > AI_REQUEST_MAX_BYTES) {
    invalidRequest('请求内容过大。')
  }

  let body: unknown
  try {
    body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    invalidRequest('请求 JSON 格式不正确。')
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    invalidRequest('请求内容格式不正确。')
  }

  const candidate = body as Record<string, unknown>
  if (typeof candidate.text !== 'string' || typeof candidate.targetDate !== 'string') {
    invalidRequest('text 和 targetDate 为必填字符串。')
  }

  const text = (candidate.text as string).trim()
  const targetDate = candidate.targetDate as string
  if (!text) {
    invalidRequest('自然语言记录不能为空。')
  }
  if (text.length > AI_TEXT_MAX_LENGTH) {
    invalidRequest(`自然语言记录不能超过 ${AI_TEXT_MAX_LENGTH} 个字符。`)
  }
  if (!isDateKey(targetDate)) {
    invalidRequest('targetDate 必须是有效的 YYYY-MM-DD 日期。')
  }

  return { text, targetDate }
}
