import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { requestNaturalLogDraft } from '../src/ai/client.ts'
import { requestPeriodAiSummary } from '../src/periodSummary/client.ts'
import { calculatePeriodSummary } from '../src/periodSummary/calculatePeriodSummary.ts'
import { requestProfileDraft } from '../src/profile/client.ts'
import { createEmptyProfileDraft } from '../src/profile/validation.ts'

const originalFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = originalFetch
})

const date = '2026-07-17'
const dailyDraft = {
  date,
  weightKg: 72,
  sleepHours: 8,
  training: '步行 30 分钟',
  foods: [],
  unestimatedMeals: [],
  unknowns: [],
  feedback: '继续记录。',
}
const profileDraft = createEmptyProfileDraft()
profileDraft.facts.heightCm = 172
const metrics = calculatePeriodSummary({}, date, date)
assert.ok(metrics)
const summary = {
  headline: '当前记录仍在积累',
  observations: ['该周期暂时没有有效记录。'],
  focus: '先保持连续记录。',
  limitations: ['数据覆盖不足。'],
}

const clients = [
  {
    name: 'daily log',
    endpoint: '/api/ai/parse-daily-log',
    body: { text: '今天步行了', targetDate: date },
    request: (signal: AbortSignal) => requestNaturalLogDraft('今天步行了', date, signal),
    payload: { draft: dailyDraft },
    expected: dailyDraft,
    network: '无法连接整理服务，请检查网络后重试。',
    fallback: '暂时无法整理这段记录，请稍后再试。',
    invalidResponse: '整理结果格式异常，请重新整理。',
    timeout: '整理超时，请重试。',
  },
  {
    name: 'profile',
    endpoint: '/api/ai/parse-profile',
    body: { text: '身高 172 厘米' },
    request: (signal: AbortSignal) => requestProfileDraft('身高 172 厘米', signal),
    payload: { draft: profileDraft },
    expected: profileDraft,
    network: '无法连接个人档案服务，请检查网络后重试。',
    fallback: '暂时无法整理个人基线，请稍后再试。',
    invalidResponse: '个人档案整理结果格式异常，请重新整理。',
    timeout: '个人信息整理超时，请重试。',
  },
  {
    name: 'period summary',
    endpoint: '/api/ai/summarize-period',
    body: { metrics },
    request: (signal: AbortSignal) => requestPeriodAiSummary(metrics, signal),
    payload: { summary },
    expected: summary,
    network: '无法连接阶段总结服务，请检查网络后重试。',
    fallback: '暂时无法生成阶段小结，请稍后再试。',
    invalidResponse: '阶段小结格式异常，请重新生成。',
    timeout: '阶段小结生成超时，请重试。',
  },
]

for (const client of clients) {
  test(`${client.name} posts its payload and validates the successful response`, async () => {
    const controller = new AbortController()
    let calls = 0
    globalThis.fetch = async (url, options) => {
      calls += 1
      assert.equal(url, client.endpoint)
      assert.equal(options?.method, 'POST')
      assert.equal(new Headers(options?.headers).get('Content-Type'), 'application/json')
      assert.deepEqual(JSON.parse(String(options?.body)), client.body)
      assert.equal(options?.signal, controller.signal)
      return Response.json(client.payload)
    }

    assert.deepEqual(await client.request(controller.signal), client.expected)
    assert.equal(calls, 1)
  })

  test(`${client.name} preserves its error messages for transport and response failures`, async () => {
    const signal = new AbortController().signal
    const expectMessage = (message: string) =>
      assert.rejects(client.request(signal), { name: 'AiRequestError', message })

    globalThis.fetch = async () => {
      throw new TypeError('Failed to fetch')
    }
    await expectMessage(client.network)

    globalThis.fetch = async () => new Response('<html>Unavailable</html>', { status: 503 })
    await expectMessage(client.fallback)

    globalThis.fetch = async () => Response.json({ code: 'AI_TIMEOUT' }, { status: 504 })
    await expectMessage(client.timeout)

    for (const payload of [null, false, 42, 'unavailable', {}, { code: 42 }, { code: 'UNKNOWN' }, { code: 'toString' }, { code: '__proto__' }]) {
      globalThis.fetch = async () => Response.json(payload, { status: 500 })
      await expectMessage(client.fallback)
    }

    globalThis.fetch = async () => ({
      ok: false,
      json: async () => Object.create({ code: 'AI_TIMEOUT' }),
    }) as Response
    await expectMessage(client.fallback)

    globalThis.fetch = async () => Response.json({})
    await expectMessage(client.invalidResponse)
  })

  test(`${client.name} preserves cancellation during fetch and response reading`, async () => {
    const controller = new AbortController()
    const aborted = new DOMException('The operation was aborted', 'AbortError')
    globalThis.fetch = async () => {
      controller.abort()
      throw aborted
    }
    await assert.rejects(client.request(controller.signal), (error) => error === aborted)

    const readingController = new AbortController()
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => {
        readingController.abort()
        throw aborted
      },
    }) as Response
    await assert.rejects(client.request(readingController.signal), (error) => error === aborted)
  })
}
