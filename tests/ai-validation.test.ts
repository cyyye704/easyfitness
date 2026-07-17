import assert from 'node:assert/strict'
import test from 'node:test'
import {
  AiValidationError,
  DeepSeekResponseError,
  normalizeEstimateRange,
  normalizeModelDraft,
  parseAiDraftApiResponse,
  parseDeepSeekCompletion,
} from '../src/ai/validation.ts'

const date = '2026-07-17'

const rawDraft = (overrides: Record<string, unknown> = {}) => ({
  weightKg: 70,
  sleepHours: 7.5,
  training: '力量训练 40 分钟',
  foods: [
    {
      name: '鸡胸肉',
      amountText: '200 克',
      caloriesRange: { min: 300, max: 360 },
      proteinRange: { min: 58, max: 64 },
      confidence: 'high',
    },
  ],
  unestimatedMeals: [],
  unknowns: [],
  feedback: '蛋白质摄入较充足。',
  ...overrides,
})

const completion = (content: unknown, finishReason = 'stop') => ({
  choices: [
    {
      finish_reason: finishReason,
      message: { content: typeof content === 'string' ? content : JSON.stringify(content) },
    },
  ],
})

test('valid model output becomes a dated editable draft', () => {
  const draft = parseDeepSeekCompletion(completion(rawDraft()), date)
  assert.equal(draft.date, date)
  assert.equal(draft.foods[0].calories, 330)
  assert.equal(draft.foods[0].protein, 61)
  assert.ok(draft.foods[0].id)
})

test('unestimated meals are preserved without inventing nutrition values', () => {
  const draft = normalizeModelDraft(
    rawDraft({
      foods: [],
      unestimatedMeals: [
        {
          description: '在海底捞吃了一顿，消费约 500 元',
          reason: '没有说明具体菜品和实际食用量，金额不能换算营养',
        },
      ],
    }),
    date,
  )

  assert.equal(draft.foods.length, 0)
  assert.equal(draft.unestimatedMeals.length, 1)
  assert.match(draft.unestimatedMeals[0].description, /海底捞/)
  assert.ok(draft.unestimatedMeals[0].id)
})

test('the server target date wins over any model supplied date', () => {
  const draft = normalizeModelDraft(rawDraft({ date: '1999-01-01' }), date)
  assert.equal(draft.date, date)
})

test('invalid draft roots and incomplete core fields are rejected', () => {
  assert.throws(() => normalizeModelDraft(null, date), AiValidationError)
  assert.throws(() => normalizeModelDraft({ foods: [] }, date), AiValidationError)
})

test('invalid JSON and empty model content have distinct errors', () => {
  assert.throws(
    () => parseDeepSeekCompletion(completion('{'), date),
    (error) => error instanceof DeepSeekResponseError && error.kind === 'invalid_json',
  )
  assert.throws(
    () => parseDeepSeekCompletion(completion('  '), date),
    (error) => error instanceof DeepSeekResponseError && error.kind === 'empty_content',
  )
})

test('missing choices and finish reasons are classified', () => {
  assert.throws(
    () => parseDeepSeekCompletion({}, date),
    (error) => error instanceof DeepSeekResponseError && error.kind === 'missing_choices',
  )
  for (const kind of ['length', 'content_filter', 'insufficient_system_resource'] as const) {
    assert.throws(
      () => parseDeepSeekCompletion(completion(rawDraft(), kind), date),
      (error) => error instanceof DeepSeekResponseError && error.kind === kind,
    )
  }
})

test('invalid scalar values become null and sleep is constrained to 24 hours', () => {
  const draft = normalizeModelDraft(rawDraft({ weightKg: -1, sleepHours: 25 }), date)
  assert.equal(draft.weightKg, null)
  assert.equal(draft.sleepHours, null)
})

test('ranges reject non-finite or negative values and normalize reversed bounds', () => {
  assert.equal(normalizeEstimateRange({ min: -1, max: 4 }), null)
  assert.equal(normalizeEstimateRange({ min: 1, max: Number.POSITIVE_INFINITY }), null)
  assert.deepEqual(normalizeEstimateRange({ min: 9, max: 3 }), { min: 3, max: 9 })
})

test('malformed foods are ignored without discarding valid foods', () => {
  const validFood = rawDraft().foods[0]
  const draft = normalizeModelDraft(rawDraft({ foods: [null, validFood] }), date)
  assert.equal(draft.foods.length, 1)
  assert.match(draft.unknowns.at(-1) ?? '', /ignored/)
})

test('invalid confidence causes only that food to be skipped', () => {
  const invalidFood = { ...rawDraft().foods[0], confidence: 'certain' }
  assert.equal(normalizeModelDraft(rawDraft({ foods: [invalidFood] }), date).foods.length, 0)
})

test('malformed unestimated meals are ignored without discarding valid ones', () => {
  const validMeal = {
    description: '聚餐一顿，菜品不详',
    reason: '无法可靠估算',
  }
  const result = normalizeModelDraft(
    rawDraft({ unestimatedMeals: [null, validMeal] }),
    date,
  )
  assert.equal(result.unestimatedMeals.length, 1)
  assert.match(result.unknowns.at(-1) ?? '', /unestimated meal/)
})

test('midpoint suggestions use integer calories and one-decimal protein', () => {
  const food = {
    ...rawDraft().foods[0],
    caloriesRange: { min: 100, max: 101 },
    proteinRange: { min: 10.04, max: 10.18 },
  }
  const result = normalizeModelDraft(rawDraft({ foods: [food] }), date).foods[0]
  assert.equal(result.calories, 101)
  assert.equal(result.protein, 10.1)
})

test('API response validation preserves API ids and edited suggested values', () => {
  const modelDraft = normalizeModelDraft(rawDraft(), date)
  const apiDraft = {
    ...modelDraft,
    foods: [{ ...modelDraft.foods[0], id: 'server-id', calories: 345, protein: 62.5 }],
    unestimatedMeals: [
      {
        id: 'server-meal-id',
        description: '聚餐一顿',
        reason: '菜品不详',
      },
    ],
  }
  const result = parseAiDraftApiResponse({ draft: apiDraft }, date)
  assert.equal(result.foods[0].id, 'server-id')
  assert.equal(result.foods[0].calories, 345)
  assert.equal(result.unestimatedMeals[0].id, 'server-meal-id')
})

test('API response date mismatch is rejected', () => {
  const draft = normalizeModelDraft(rawDraft(), date)
  assert.throws(
    () => parseAiDraftApiResponse({ draft }, '2026-07-18'),
    AiValidationError,
  )
})
