import assert from 'node:assert/strict'
import test from 'node:test'
import {
  HttpRequestError,
  parseDailyLogRequest,
} from '../api/_lib/http.ts'

const url = 'https://easyfitness.example/api/ai/parse-daily-log'

const request = (
  body: unknown,
  options: { method?: string; contentType?: string; origin?: string } = {},
) =>
  new Request(url, {
    method: options.method ?? 'POST',
    headers: {
      'Content-Type': options.contentType ?? 'application/json',
      ...(options.origin ? { Origin: options.origin } : {}),
    },
    body: options.method === 'GET' ? undefined : JSON.stringify(body),
  })

const hasCode = (code: string) => (error: unknown) =>
  error instanceof HttpRequestError && error.code === code

test('API request parsing trims text and accepts a valid target date', async () => {
  const result = await parseDailyLogRequest(
    request({ text: '  今天跑步 30 分钟  ', targetDate: '2026-07-17' }),
  )
  assert.deepEqual(result, { text: '今天跑步 30 分钟', targetDate: '2026-07-17' })
})

test('API rejects non-POST methods with a stable error code', async () => {
  await assert.rejects(
    parseDailyLogRequest(request({}, { method: 'GET' })),
    hasCode('METHOD_NOT_ALLOWED'),
  )
})

test('API rejects non-JSON content types with a stable error code', async () => {
  await assert.rejects(
    parseDailyLogRequest(request({}, { contentType: 'text/plain' })),
    hasCode('UNSUPPORTED_MEDIA_TYPE'),
  )
})

test('API rejects cross-origin browser requests', async () => {
  await assert.rejects(
    parseDailyLogRequest(
      request(
        { text: '跑步', targetDate: '2026-07-17' },
        { origin: 'https://evil.example' },
      ),
    ),
    hasCode('INVALID_REQUEST'),
  )
})

test('API accepts a matching Origin header', async () => {
  const result = await parseDailyLogRequest(
    request(
      { text: '跑步', targetDate: '2026-07-17' },
      { origin: 'https://easyfitness.example' },
    ),
  )
  assert.equal(result.text, '跑步')
})

test('API rejects blank, overlong and invalid-date bodies', async () => {
  await assert.rejects(
    parseDailyLogRequest(request({ text: ' ', targetDate: '2026-07-17' })),
    hasCode('INVALID_REQUEST'),
  )
  await assert.rejects(
    parseDailyLogRequest(request({ text: 'a'.repeat(4001), targetDate: '2026-07-17' })),
    hasCode('INVALID_REQUEST'),
  )
  await assert.rejects(
    parseDailyLogRequest(request({ text: '跑步', targetDate: '2026-02-30' })),
    hasCode('INVALID_REQUEST'),
  )
})
