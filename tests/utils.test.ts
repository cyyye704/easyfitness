import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createEmptyRecord,
  evaluateRecord,
  hasRecordContent,
  isDateKey,
  summarizeNutrition,
} from '../src/utils.ts'

test('summarizeNutrition avoids floating-point display tails', () => {
  const summary = summarizeNutrition([
    { id: '1', name: '食物一', calories: 100, protein: 0.1 },
    { id: '2', name: '食物二', calories: 101, protein: 0.2 },
  ])

  assert.deepEqual(summary, { totalCalories: 201, totalProtein: 0.3 })
})

test('evaluateRecord applies the current rating rules', () => {
  const record = {
    ...createEmptyRecord('2026-07-17'),
    sleepHours: 7,
    training: '力量训练 45 分钟',
    trainingStatus: 'trained' as const,
    nutritionComplete: true,
    foods: [{ id: '1', name: '全天饮食', calories: 1800, protein: 90 }],
  }

  assert.equal(evaluateRecord(record).rating, '加分')
})

test('partial food logs stay pending without nutritional penalties', () => {
  const result = evaluateRecord({ ...createEmptyRecord('2026-09-29'),
    foods: [{ id: 'breakfast', name: '早餐', calories: 300, protein: 10 }] })
  assert.equal(result.rating, '待补充')
  assert.equal(result.score, 0)
  assert.doesNotMatch(result.reasons.join(' '), /偏低|超出/)
})

test('training notes never imply training and rest days do not earn training points', () => {
  const record = { ...createEmptyRecord('2026-09-29'), training: '今天没训练', sleepHours: 7, nutritionComplete: true,
    foods: [{ id: 'all', name: '全天', calories: 2000, protein: 90 }] }
  const unknown = evaluateRecord(record)
  const rest = evaluateRecord({ ...record, trainingStatus: 'rest' })
  const trained = evaluateRecord({ ...record, trainingStatus: 'trained' })
  assert.equal(unknown.rating, '待补充')
  assert.equal(rest.score, unknown.score)
  assert.equal(trained.score, rest.score + 1)
})

test('date keys and meaningful record content are identified strictly', () => {
  assert.equal(isDateKey('2026-07-17'), true)
  assert.equal(isDateKey('2026-02-30'), false)
  assert.equal(isDateKey(''), false)
  assert.equal(hasRecordContent(createEmptyRecord('2026-07-17')), false)
  assert.equal(
    hasRecordContent({
      ...createEmptyRecord('2026-07-17'),
      training: '步行 8000 步',
    }),
    true,
  )
  assert.equal(
    hasRecordContent({
      ...createEmptyRecord('2026-07-17'),
      unestimatedMeals: [
        { id: 'meal-1', description: '聚餐一顿', reason: '菜品不详' },
      ],
    }),
    true,
  )
})

test('unestimated meals do not change nutrition totals or rating score', () => {
  const record = {
    ...createEmptyRecord('2026-07-17'),
    unestimatedMeals: [
      { id: 'meal-1', description: '海底捞聚餐', reason: '菜品不详' },
    ],
  }

  assert.deepEqual(summarizeNutrition(record.foods), {
    totalCalories: 0,
    totalProtein: 0,
  })
  assert.equal(evaluateRecord(record).score, 0)
  assert.match(evaluateRecord(record).reasons[0], /未估算/)
})
