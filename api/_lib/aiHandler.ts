import { AiServiceError } from './deepseek.js'
import { errorResponse, HttpRequestError, jsonResponse } from './http.js'

type AiHandlerOptions<Input> = {
  feature?: string
  disabledMessage: string
  parse: (request: Request) => Promise<Input>
  execute: (
    input: Input,
    signal: AbortSignal,
  ) => Promise<{ body: unknown; retried: boolean }>
}

export const createAiHandler = <Input>(options: AiHandlerOptions<Input>) =>
  async (request: Request): Promise<Response> => {
    const requestId = crypto.randomUUID()
    const startedAt = Date.now()
    const logResult = (
      category: string,
      retried: boolean,
      upstreamStatus?: number,
    ) => {
      // Keep logs limited to operational metadata, never input or error payloads.
      console.info(JSON.stringify({
        requestId,
        time: new Date().toISOString(),
        elapsedMs: Date.now() - startedAt,
        category,
        upstreamStatus,
        retried,
        feature: options.feature,
      }))
    }

    try {
      const input = await options.parse(request)
      if ((process.env.AI_FEATURE_ENABLED ?? '').toLowerCase() !== 'true') {
        return errorResponse(503, 'AI_DISABLED', options.disabledMessage)
      }

      const result = await options.execute(input, request.signal)
      logResult('success', result.retried)
      return jsonResponse(result.body)
    } catch (error) {
      if (error instanceof HttpRequestError) {
        return errorResponse(error.status, error.code, error.message)
      }
      if (error instanceof AiServiceError) {
        logResult(error.category, error.retried, error.upstreamStatus)
        return errorResponse(error.status, error.code, error.message)
      }

      logResult('unexpected', false)
      return errorResponse(500, 'AI_UPSTREAM_ERROR', '服务暂时不可用，请稍后再试。')
    }
  }
