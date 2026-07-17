import assert from 'node:assert/strict'
import test from 'node:test'
import type { AiDailyDraft, AiFoodDraft } from '../src/ai/types.ts'
import {
  canConfirmAiDraft,
  hasSaveableAiDraft,
  mergeAiDraft,
  mergeFoodNameAndAmount,
  mergeTrainingText,
} from '../src/ai/mergeAiDraft.ts'
import { createEmptyRecord } from '../src/utils.ts'

const date = '2026-07-17'

const food = (overrides: Partial<AiFoodDraft> = {}): AiFoodDraft => ({
  id: 'draft-id',
  name: '鸡胸肉',
  amountText: '200 克',
  caloriesRange: { min: 300, max: 360 },
  proteinRange: { min: 58, max: 64 },
  calories: 330,
  protein: 61,
  confidence: 'high',
  ...overrides,
})

const draft = (overrides: Partial<AiDailyDraft> = {}): AiDailyDraft => ({
  date,
  weightKg: null,
  sleepHours: null,
  training: '',
  foods: [],
  unestimatedMeals: [],
  unknowns: [],
  feedback: '',
  ...overrides,
})

test('AI foods are prepended in their original order and existing foods remain', () => {
  const current = {
    ...createEmptyRecord(date),
    foods: [{ id: 'old', name: '苹果', calories: 80, protein: 0.4 }],
  }
  const result = mergeAiDraft(
    current,
    draft({ foods: [food({ name: '食物 A' }), food({ name: '食物 B' })] }),
    { replaceWeight: false, replaceSleep: false },
  )
  assert.deepEqual(result.foods.map((item) => item.name), [
    '食物 A（200 克）',
    '食物 B（200 克）',
    '苹果',
  ])
})

test('confirmed foods get official ids instead of keeping draft ids', () => {
  const result = mergeAiDraft(createEmptyRecord(date), draft({ foods: [food()] }), {
    replaceWeight: false,
    replaceSleep: false,
  })
  assert.notEqual(result.foods[0].id, 'draft-id')
})

test('unestimated meals are saved separately and count as saveable content', () => {
  const proposed = draft({
    unestimatedMeals: [
      {
        id: 'draft-meal-id',
        description: '在海底捞吃了一顿，消费约 500 元',
        reason: '菜品和实际食用量不详',
      },
    ],
  })
  const result = mergeAiDraft(createEmptyRecord(date), proposed, {
    replaceWeight: false,
    replaceSleep: false,
  })

  assert.equal(hasSaveableAiDraft(proposed), true)
  assert.equal(result.foods.length, 0)
  assert.equal(result.unestimatedMeals.length, 1)
  assert.notEqual(result.unestimatedMeals[0].id, 'draft-meal-id')
})

test('amount suffix is appended exactly once', () => {
  assert.equal(mergeFoodNameAndAmount('米饭', '一碗'), '米饭（一碗）')
  assert.equal(mergeFoodNameAndAmount('米饭（一碗）', '一碗'), '米饭（一碗）')
})

test('blank names and foods with two invalid final values are ignored', () => {
  const result = mergeAiDraft(
    createEmptyRecord(date),
    draft({
      foods: [
        food({ name: '   ' }),
        food({ calories: Number.NaN, protein: -1 }),
      ],
    }),
    { replaceWeight: false, replaceSleep: false },
  )
  assert.equal(result.foods.length, 0)
})

test('one valid nutrition value keeps the food and defaults the other to zero', () => {
  const result = mergeAiDraft(
    createEmptyRecord(date),
    draft({ foods: [food({ calories: null, protein: 20.26 })] }),
    { replaceWeight: false, replaceSleep: false },
  )
  assert.equal(result.foods[0].calories, 0)
  assert.equal(result.foods[0].protein, 20.3)
})

test('calories are rounded to an integer', () => {
  const result = mergeAiDraft(
    createEmptyRecord(date),
    draft({ foods: [food({ calories: 123.6 })] }),
    { replaceWeight: false, replaceSleep: false },
  )
  assert.equal(result.foods[0].calories, 124)
})

test('training merge handles empty values, appends new text, and avoids exact duplicates', () => {
  assert.equal(mergeTrainingText('原训练', ''), '原训练')
  assert.equal(mergeTrainingText('', '新训练'), '新训练')
  assert.equal(mergeTrainingText('原训练', '新训练'), '原训练\n新训练')
  assert.equal(mergeTrainingText('相同', '相同'), '相同')
})

test('empty current scalar values accept valid draft values', () => {
  const result = mergeAiDraft(
    createEmptyRecord(date),
    draft({ weightKg: 70.5, sleepHours: 7.5 }),
    { replaceWeight: false, replaceSleep: false },
  )
  assert.equal(result.weightKg, 70.5)
  assert.equal(result.sleepHours, 7.5)
})

test('existing scalar values are preserved by default and replace only by explicit choice', () => {
  const current = { ...createEmptyRecord(date), weightKg: 80, sleepHours: 6 }
  const proposed = draft({ weightKg: 79, sleepHours: 8 })
  const kept = mergeAiDraft(current, proposed, {
    replaceWeight: false,
    replaceSleep: false,
  })
  const replaced = mergeAiDraft(current, proposed, {
    replaceWeight: true,
    replaceSleep: true,
  })
  assert.deepEqual([kept.weightKg, kept.sleepHours], [80, 6])
  assert.deepEqual([replaced.weightKg, replaced.sleepHours], [79, 8])
})

test('invalid draft scalars never overwrite current values', () => {
  const current = { ...createEmptyRecord(date), weightKg: 80, sleepHours: 6 }
  const result = mergeAiDraft(
    current,
    draft({ weightKg: Number.NaN, sleepHours: 25 }),
    { replaceWeight: true, replaceSleep: true },
  )
  assert.deepEqual([result.weightKg, result.sleepHours], [80, 6])
})

test('the current record date is always authoritative', () => {
  const result = mergeAiDraft(
    createEmptyRecord(date),
    draft({ date: '1999-01-01', training: '跑步' }),
    { replaceWeight: false, replaceSleep: false },
  )
  assert.equal(result.date, date)
})

test('saveability and confirmation predicates enforce content, date and duplicate guards', () => {
  const usable = draft({ training: '跑步' })
  assert.equal(hasSaveableAiDraft(draft()), false)
  assert.equal(hasSaveableAiDraft(usable), true)
  assert.equal(canConfirmAiDraft(null, date, false), false)
  assert.equal(canConfirmAiDraft(usable, date, true), false)
  assert.equal(canConfirmAiDraft(usable, '2026-07-18', false), false)
  assert.equal(canConfirmAiDraft(usable, date, false), true)
})
