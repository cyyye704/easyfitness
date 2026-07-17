import assert from 'node:assert/strict'
import test from 'node:test'
import { parsePeriodSummaryRequest } from '../api/_lib/periodSummaryHttp.ts'
import {
  PERIOD_SUMMARY_SYSTEM_PROMPT,
} from '../api/_lib/periodSummaryPrompt.ts'
import {
  calculatePeriodSummary,
} from '../src/periodSummary/calculatePeriodSummary.ts'
import {
  normalizePeriodSummaryMetrics,
  parseDeepSeekPeriodSummaryCompletion,
  PeriodSummaryValidationError,
} from '../src/periodSummary/validation.ts'

const metrics = calculatePeriodSummary({}, '2026-07-11', '2026-07-17')

const completion = (content: unknown) => ({
  choices: [
    {
      finish_reason: 'stop',
      message: {
        content: typeof content === 'string' ? content : JSON.stringify(content),
      },
    },
  ],
})

const request = (body: unknown, method = 'POST') =>
  new Request('https://easyfitness.example/api/ai/summarize-period', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: method === 'GET' ? undefined : JSON.stringify(body),
  })

test('validated period metrics preserve a locally calculated payload', () => {
  assert.ok(metrics)
  assert.deepEqual(normalizePeriodSummaryMetrics(metrics), metrics)
})

test('period metric validation rejects inconsistent ranges and counts', () => {
  assert.ok(metrics)
  assert.throws(
    () =>
      normalizePeriodSummaryMetrics({
        ...metrics,
        range: { ...metrics.range, totalDays: 8 },
      }),
    PeriodSummaryValidationError,
  )
  assert.throws(
    () =>
      normalizePeriodSummaryMetrics({
        ...metrics,
        coverage: { recordedDays: 99 },
      }),
    PeriodSummaryValidationError,
  )
})

test('DeepSeek period summary output is parsed through a strict JSON shape', () => {
  const result = parseDeepSeekPeriodSummaryCompletion(
    completion({
      headline: '本阶段记录仍在积累',
      observations: ['当前周期没有足够记录形成趋势。', '未记录日期不能视为零。'],
      focus: '下一阶段先保持连续记录。',
      limitations: ['数据覆盖不足。'],
    }),
  )
  assert.equal(result.observations.length, 2)
  assert.match(result.focus, /连续记录/)
})

test('period summary API parser accepts valid metrics and rejects invalid bodies', async () => {
  assert.ok(metrics)
  const parsed = await parsePeriodSummaryRequest(request({ metrics }))
  assert.deepEqual(parsed, metrics)
  await assert.rejects(parsePeriodSummaryRequest(request({})))
  await assert.rejects(parsePeriodSummaryRequest(request({ metrics }, 'GET')))
})

test('period prompt forbids recomputation and missing-day assumptions', () => {
  assert.match(PERIOD_SUMMARY_SYSTEM_PROMPT, /不重新计算数据/)
  assert.match(PERIOD_SUMMARY_SYSTEM_PROMPT, /未记录日期不能视为零/)
  assert.match(PERIOD_SUMMARY_SYSTEM_PROMPT, /未计入营养均值/)
})
