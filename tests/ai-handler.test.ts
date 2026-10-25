import assert from 'node:assert/strict'
import { test, type TestContext } from 'node:test'
import { createAiHandler } from '../api/_lib/aiHandler.ts'
import { parseDailyLogRequest } from '../api/_lib/http.ts'
import dailyHandler from '../api/ai/parse-daily-log.ts'
import profileHandler from '../api/ai/parse-profile.ts'
import periodHandler from '../api/ai/summarize-period.ts'
import { calculatePeriodSummary } from '../src/periodSummary/calculatePeriodSummary.ts'

const privateInput = 'PRIVATE_USER_INPUT_不应写入日志'
const privateKey = 'test-secret-not-for-logs'
const targetDate = '2026-07-17'
const metrics = calculatePeriodSummary({}, '2026-07-11', targetDate)
assert.ok(metrics)

const routes = [
  {
    name: 'parse-daily-log',
    handler: dailyHandler,
    input: { text: privateInput, targetDate },
    output: {
      weightKg: 70,
      sleepHours: 7,
      training: '',
      foods: [],
      unestimatedMeals: [],
      unknowns: [],
      feedback: '',
    },
    responseKey: 'draft',
    expectedContent: /"date":"2026-07-17"/,
    feature: undefined,
    disabledMessage: 'AI 自然语言记录功能当前未启用。',
  },
  {
    name: 'parse-profile',
    handler: profileHandler,
    input: { text: privateInput },
    output: { facts: { heightCm: 172 }, estimates: {}, unknowns: [] },
    responseKey: 'draft',
    expectedContent: /"heightCm":172/,
    feature: 'profile_parse',
    disabledMessage: 'AI 个人档案功能当前未启用。',
  },
  {
    name: 'summarize-period',
    handler: periodHandler,
    input: { metrics: { ...metrics, limitations: [privateInput] } },
    output: {
      headline: '记录仍在积累',
      observations: ['当前记录不足以形成趋势。'],
      focus: '先保持连续记录。',
      limitations: ['数据覆盖不足。'],
    },
    responseKey: 'summary',
    expectedContent: /"headline":"记录仍在积累"/,
    feature: 'period_summary',
    disabledMessage: 'AI 阶段总结功能当前未启用。',
  },
]

const makeRequest = (route: string, body: unknown) =>
  new Request(`https://easyfitness.example/api/ai/${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

const configureAi = (context: TestContext, enabled = 'true') => {
  for (const [name, value] of Object.entries({
    AI_FEATURE_ENABLED: enabled,
    DEEPSEEK_API_KEY: privateKey,
  })) {
    const previous = process.env[name]
    process.env[name] = value
    context.after(() => {
      if (previous === undefined) delete process.env[name]
      else process.env[name] = previous
    })
  }
  const logs: string[] = []
  context.mock.method(console, 'info', (message: string) => logs.push(message))
  return logs
}

const assertSafeLog = (logs: string[]) => {
  assert.equal(logs.length, 1)
  assert.ok(!logs[0].includes(privateInput))
  assert.ok(!logs[0].includes(privateKey))
  const entry = JSON.parse(logs[0])
  const allowedKeys = [
    'requestId', 'time', 'elapsedMs', 'category', 'upstreamStatus', 'retried', 'feature',
  ]
  assert.ok(Object.keys(entry).every((key) => allowedKeys.includes(key)))
  assert.match(entry.requestId, /^[0-9a-f-]{36}$/)
  assert.ok(Number.isFinite(Date.parse(entry.time)))
  assert.ok(entry.elapsedMs >= 0)
  return entry
}

for (const route of routes) {
  for (const scenario of [
    { name: 'success', statuses: [200], status: 200, retried: false },
    { name: 'retry success', statuses: [503, 200], status: 200, retried: true },
    { name: 'retry failure', statuses: [503, 503], status: 502, retried: true },
    { name: 'rate limit', statuses: [429], status: 429, retried: false },
  ]) {
    test(`${route.name} preserves ${scenario.name}, response shape and safe logs`, async (context) => {
      const logs = configureAi(context, 'TRUE')
      let calls = 0
      context.mock.method(globalThis, 'fetch', async () => {
        const status = scenario.statuses[calls++]
        assert.ok(status, 'unexpected extra upstream request')
        return new Response(JSON.stringify({
          choices: [{
            finish_reason: 'stop',
            message: { content: JSON.stringify(route.output) },
          }],
        }), { status, headers: { 'Content-Type': 'application/json' } })
      })

      const response = await route.handler.fetch(makeRequest(route.name, route.input))
      assert.equal(response.status, scenario.status)
      assert.equal(response.headers.get('Cache-Control'), 'no-store')
      assert.equal(calls, scenario.statuses.length)
      const body = await response.json()
      if (scenario.status === 200) {
        assert.deepEqual(Object.keys(body), [route.responseKey])
        assert.match(JSON.stringify(body), route.expectedContent)
      } else {
        assert.deepEqual(body, scenario.status === 429
          ? { code: 'AI_RATE_LIMITED', error: 'AI 请求过于频繁，请稍后再试。' }
          : { code: 'AI_UPSTREAM_ERROR', error: 'AI 服务暂时不可用，请稍后再试。' })
      }
      const entry = assertSafeLog(logs)
      assert.equal(entry.feature, route.feature)
      assert.equal(entry.retried, scenario.retried)
      assert.equal(entry.category, scenario.status === 200 ? 'success' : 'upstream_http')
      assert.equal(entry.upstreamStatus, scenario.status === 200 ? undefined : scenario.statuses.at(-1))
    })
  }

  test(`${route.name} validates before checking the feature flag and never calls upstream when disabled`, async (context) => {
    const logs = configureAi(context, 'false')
    const upstream = context.mock.method(globalThis, 'fetch', async () => {
      throw new Error('disabled AI must not call upstream')
    })
    const invalid = await route.handler.fetch(makeRequest(route.name, {}))
    assert.equal(invalid.status, 400)
    assert.equal((await invalid.json()).code, 'INVALID_REQUEST')
    assert.equal(invalid.headers.get('Cache-Control'), 'no-store')

    const disabled = await route.handler.fetch(makeRequest(route.name, route.input))
    assert.equal(disabled.status, 503)
    assert.deepEqual(await disabled.json(), {
      code: 'AI_DISABLED',
      error: route.disabledMessage,
    })
    assert.equal(disabled.headers.get('Cache-Control'), 'no-store')
    assert.equal(upstream.mock.callCount(), 0)
    assert.deepEqual(logs, [])
  })
}

test('shared handler forwards cancellation and hides unexpected service error details', async (context) => {
  const logs = configureAi(context)
  const request = makeRequest('parse-daily-log', { text: privateInput, targetDate })
  const handler = createAiHandler({
    disabledMessage: 'disabled',
    parse: parseDailyLogRequest,
    execute: async (input, signal) => {
      assert.deepEqual(input, { text: privateInput, targetDate })
      assert.equal(signal, request.signal)
      throw new Error(`${privateInput}: ${privateKey}`)
    },
  })
  const response = await handler(request)
  assert.equal(response.status, 500)
  assert.equal(response.headers.get('Cache-Control'), 'no-store')
  assert.deepEqual(await response.json(), {
    code: 'AI_UPSTREAM_ERROR',
    error: '服务暂时不可用，请稍后再试。',
  })
  const entry = assertSafeLog(logs)
  assert.equal(entry.category, 'unexpected')
  assert.equal(entry.retried, false)
})
