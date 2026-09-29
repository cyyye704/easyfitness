import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { appendFoods, parseFoodValues, restoreDeletedFood, scaleFoods } from '../src/food/foodUtils.ts'
import { loadFoodTemplates, saveFoodTemplates } from '../src/food/templateStorage.ts'
import { calculateWeightTrend } from '../src/periodSummary/weightTrend.ts'
import { createEmptyRecord } from '../src/utils.ts'
import { loadRecords, saveRecords } from '../src/storage.ts'

const originalStorage = globalThis.localStorage
afterEach(() => Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: originalStorage }))
const useStorage = () => {
  const data = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
  } })
  return data
}
const food = { id: 'old', name: '早餐', calories: 200, protein: 10, meal: 'breakfast' as const }

test('food validation distinguishes missing values from explicit zero', () => {
  for (const value of ['', ' ', '-1', 'NaN', 'Infinity', '100001']) {
    assert.equal(parseFoodValues('食物', value, '0', 'lunch'), null)
  }
  assert.equal(parseFoodValues('食物', '0', '0', 'lunch')?.calories, 0)
  assert.equal(parseFoodValues(' ', '12', '1', 'lunch'), null)
})

test('template scaling and copying generate independent IDs and reset completeness', () => {
  const scaled = scaleFoods([food], 1.5, 'dinner')
  assert.equal(scaled[0].calories, 300)
  assert.equal(scaled[0].protein, 15)
  assert.equal(scaled[0].meal, 'dinner')
  assert.notEqual(scaled[0].id, food.id)
  assert.notEqual(scaleFoods([food], 1.5, 'dinner')[0].id, scaled[0].id)
  const old = { ...createEmptyRecord('2026-09-29'), nutritionComplete: true, foods: [food] }
  const next = appendFoods(old, scaled)
  assert.equal(next.nutritionComplete, false)
  assert.equal(next.foods.length, 2)
  assert.equal(old.foods.length, 1)
  assert.equal(food.calories, 200)
  for (const amount of [0, -1, NaN, Infinity, 101]) assert.deepEqual(scaleFoods([food], amount, 'lunch'), [])
})

test('undo restores just the deleted item and preserves subsequent changes', () => {
  const current = { ...createEmptyRecord('2026-09-29'), sleepHours: 8,
    foods: [{ ...food, id: 'new', calories: 500 }] }
  const deletion = { kind: 'food' as const, date: current.date, item: food, index: 0 }
  const restored = restoreDeletedFood(current, deletion)
  assert.deepEqual(restored.foods.map((item) => item.calories), [200, 500])
  assert.equal(restored.sleepHours, 8)
  assert.equal(restoreDeletedFood(restored, deletion), restored)
  assert.equal(restoreDeletedFood({ ...current, date: '2026-09-30' }, deletion).foods.length, 1)
  const meal = { id: 'm', description: '聚餐', reason: '未知' }
  assert.deepEqual(restoreDeletedFood(current, { kind: 'unestimated', date: current.date, item: meal, index: 0 }).unestimatedMeals, [meal])
})

test('legacy records default to unconfirmed and new fields survive reload', () => {
  const storage = useStorage()
  storage.set('easyfitness.records.v1', JSON.stringify({ version: 1, records: {
    '2026-09-28': { date: '2026-09-28', weightKg: null, sleepHours: null, training: '没有训练', foods: [food] },
  } }))
  const legacy = loadRecords().records['2026-09-28']
  assert.equal(legacy.trainingStatus, 'unrecorded')
  assert.equal(legacy.nutritionComplete, false)
  const updated = { ...legacy, trainingStatus: 'rest' as const, nutritionComplete: true }
  assert.equal(saveRecords({ [updated.date]: updated }).ok, true)
  assert.deepEqual(loadRecords().records[updated.date], updated)
})

test('template storage stays independent and does not overwrite malformed content on read', () => {
  const storage = useStorage()
  storage.set('easyfitness.records.v1', 'daily sentinel')
  storage.set('easyfitness.profile.v1', 'profile sentinel')
  const templates = [{ id: 't', name: '常用早餐', foods: [food] }]
  assert.equal(saveFoodTemplates(templates), null)
  assert.equal(loadFoodTemplates().templates[0].foods[0].calories, 200)
  assert.equal(storage.get('easyfitness.records.v1'), 'daily sentinel')
  assert.equal(storage.get('easyfitness.profile.v1'), 'profile sentinel')
  storage.set('easyfitness.food-templates.v1', '{bad json')
  assert.equal(loadFoodTemplates().writable, false)
  assert.equal(storage.get('easyfitness.food-templates.v1'), '{bad json')
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    setItem: () => { throw new Error('Storage full') },
  } })
  assert.match(saveFoodTemplates(templates) ?? '', /保存失败/)
})

test('recovering damaged food data cannot retain a complete-day flag', () => {
  const storage = useStorage()
  storage.set('easyfitness.records.v1', JSON.stringify({ version: 1, records: {
    '2026-09-29': { ...createEmptyRecord('2026-09-29'), nutritionComplete: true, foods: [food, null] },
  } }))
  const loaded = loadRecords()
  assert.equal(loaded.records['2026-09-29'].nutritionComplete, false)
  assert.equal(loaded.records['2026-09-29'].foods.length, 1)
})

test('rolling weights use seven calendar days, include prior-period data and exclude future readings', () => {
  const records = Object.fromEntries([['2026-09-01', 90], ['2026-09-02', 70], ['2026-09-08', 72], ['2026-09-09', 100]]
    .map(([date, weight]) => [date, { ...createEmptyRecord(String(date)), weightKg: Number(weight) }]))
  const points = calculateWeightTrend(records, '2026-09-08', '2026-09-08')
  assert.deepEqual(points, [{ date: '2026-09-08', weightKg: 72, averageKg: 71, sampleCount: 2 }])
  const gaps = calculateWeightTrend(records, '2026-09-15', '2026-09-16')
  assert.equal(gaps[0].averageKg, 100)
  assert.equal(gaps[0].weightKg, null)
  assert.equal(gaps[1].averageKg, null)
  assert.equal(gaps[1].sampleCount, 0)
  assert.deepEqual(calculateWeightTrend(records, 'bad', '2026-09-16'), [])
})

test('weight trends handle flat, empty and invalid measurements', () => {
  const records = Object.fromEntries([70, 70, 0, NaN].map((weightKg, index) => {
    const date = `2026-09-0${index + 1}`
    return [date, { ...createEmptyRecord(date), weightKg }]
  }))
  const points = calculateWeightTrend(records, '2026-09-01', '2026-09-04')
  assert.ok(points.every((point) => point.averageKg === 70))
  assert.equal(points[3].sampleCount, 2)
  assert.equal(points[2].weightKg, null)
  assert.equal(calculateWeightTrend({}, '2026-09-01', '2026-09-01')[0].averageKg, null)
})
