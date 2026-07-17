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
    foods: [{ id: '1', name: '全天饮食', calories: 1800, protein: 90 }],
  }

  assert.equal(evaluateRecord(record).rating, '加分')
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
})
