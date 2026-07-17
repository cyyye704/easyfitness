import assert from 'node:assert/strict'
import test from 'node:test'
import {
  calculatePeriodSummary,
  countPeriodDays,
  getPeriodRangeError,
  shiftDateKey,
} from '../src/periodSummary/calculatePeriodSummary.ts'
import { createEmptyRecord } from '../src/utils.ts'

const record = (
  date: string,
  values: Partial<ReturnType<typeof createEmptyRecord>>,
) => ({ ...createEmptyRecord(date), ...values })

test('date range helpers use inclusive calendar days and reject invalid ranges', () => {
  assert.equal(shiftDateKey('2026-07-17', -6), '2026-07-11')
  assert.equal(countPeriodDays('2026-07-11', '2026-07-17'), 7)
  assert.match(getPeriodRangeError('2026-07-18', '2026-07-17') ?? '', /不能早于/)
  assert.match(getPeriodRangeError('2026-01-01', '2026-07-17') ?? '', /90/)
})

test('period metrics never treat missing days as zero-valued records', () => {
  const metrics = calculatePeriodSummary(
    {
      '2026-07-11': record('2026-07-11', {
        weightKg: 72,
        sleepHours: 7,
        foods: [{ id: 'food-1', name: '已记录饮食', calories: 1800, protein: 80 }],
      }),
      '2026-07-14': record('2026-07-14', {
        training: '力量训练',
        sleepHours: 5.5,
        foods: [{ id: 'food-2', name: '已记录饮食', calories: 2000, protein: 100 }],
        unestimatedMeals: [
          { id: 'meal-1', description: '聚餐', reason: '菜品不详' },
        ],
      }),
      '2026-07-17': record('2026-07-17', { weightKg: 71.5 }),
    },
    '2026-07-11',
    '2026-07-17',
  )

  assert.ok(metrics)
  assert.equal(metrics.range.totalDays, 7)
  assert.equal(metrics.coverage.recordedDays, 3)
  assert.equal(metrics.nutrition.recordedDays, 2)
  assert.equal(metrics.nutrition.averageCalories, 1900)
  assert.equal(metrics.nutrition.averageProtein, 90)
  assert.equal(metrics.nutrition.unestimatedMealCount, 1)
  assert.equal(metrics.training.days, 1)
  assert.equal(metrics.sleep.averageHours, 6.3)
  assert.equal(metrics.weight.changeKg, -0.5)
  assert.match(metrics.limitations.join(' '), /未记录日期不能按零计算/)
  assert.match(metrics.limitations.join(' '), /未估算饮食/)
})

test('six weight readings use first and last three-reading averages', () => {
  const weights = [70, 72, 74, 68, 70, 72]
  const records = Object.fromEntries(
    weights.map((weightKg, index) => {
      const date = shiftDateKey('2026-07-01', index)
      return [date, record(date, { weightKg })]
    }),
  )
  const metrics = calculatePeriodSummary(records, '2026-07-01', '2026-07-06')

  assert.equal(metrics?.weight.method, 'three-point-average')
  assert.equal(metrics?.weight.startKg, 72)
  assert.equal(metrics?.weight.endKg, 70)
  assert.equal(metrics?.weight.changeKg, -2)
})

test('empty periods return factual limitations and no invented averages', () => {
  const metrics = calculatePeriodSummary({}, '2026-07-11', '2026-07-17')
  assert.equal(metrics?.coverage.recordedDays, 0)
  assert.equal(metrics?.weight.changeKg, null)
  assert.equal(metrics?.nutrition.averageCalories, null)
  assert.equal(metrics?.sleep.averageHours, null)
  assert.match(metrics?.limitations.join(' ') ?? '', /没有任何有效记录/)
})
