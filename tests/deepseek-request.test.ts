import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AiServiceError, requestDeepSeekJson } from '../api/_lib/deepseek.ts'

for (const afterRetry of [false, true]) {
  test(`cancelling while reading ${afterRetry ? 'the retried' : 'the first'} DeepSeek response stops without another attempt`, async (context) => {
    const previousKey = process.env.DEEPSEEK_API_KEY
    process.env.DEEPSEEK_API_KEY = 'test-only-key'
    context.after(() => {
      if (previousKey === undefined) delete process.env.DEEPSEEK_API_KEY
      else process.env.DEEPSEEK_API_KEY = previousKey
    })

    const controller = new AbortController()
    const aborted = new DOMException('Aborted while reading response', 'AbortError')
    let calls = 0
    const fetchMock = context.mock.method(globalThis, 'fetch', async (_url, options) => {
      calls += 1
      if (options?.signal?.aborted) throw aborted
      if (afterRetry && calls === 1) return new Response('', { status: 503 })

      const response = new Response('', { status: 200 })
      context.mock.method(response, 'json', async () => {
        controller.abort()
        assert.equal(options?.signal?.aborted, true)
        throw aborted
      })
      return response
    })

    await assert.rejects(
      requestDeepSeekJson({
        systemPrompt: 'test',
        userPrompt: 'test',
        requestSignal: controller.signal,
        maxTokens: 10,
        parsePayload: () => assert.fail('cancelled response must not be parsed'),
      }),
      (error: unknown) => {
        assert.ok(error instanceof AiServiceError)
        assert.equal(error.status, 499)
        assert.equal(error.code, 'AI_UPSTREAM_ERROR')
        assert.equal(error.category, 'client_abort')
        assert.equal(error.message, '请求已取消。')
        assert.equal(error.retried, afterRetry)
        return true
      },
    )
    assert.equal(fetchMock.mock.callCount(), afterRetry ? 2 : 1)
  })
}
