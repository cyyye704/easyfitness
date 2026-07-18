import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getNextProfileQuestionId,
  getPreviousProfileQuestionId,
  selectProfileQuestionIds,
} from '../src/profile/questionEngine.ts'
import { createEmptyProfileDraft } from '../src/profile/validation.ts'

test('missing core profile fields are asked in deterministic priority order', () => {
  const ids = selectProfileQuestionIds(createEmptyProfileDraft())
  assert.deepEqual(ids, [
    'heightCm',
    'baselineWeightKg',
    'age',
    'primaryGoal',
    'activityLevel',
  ])
  assert.equal(ids.length, 5)
})

test('fields already present in natural-language output are not asked again', () => {
  const draft = createEmptyProfileDraft()
  draft.facts.heightCm = 172
  draft.facts.baselineWeightKg = 78
  draft.facts.age = 20
  draft.facts.primaryGoal = 'fat-loss'
  draft.facts.activityLevel = 'sedentary'
  const ids = selectProfileQuestionIds(draft)
  assert.ok(!ids.includes('heightCm'))
  assert.ok(!ids.includes('baselineWeightKg'))
  assert.ok(!ids.includes('age'))
  assert.ok(!ids.includes('primaryGoal'))
  assert.ok(!ids.includes('activityLevel'))
})

test('answered and skipped profile questions do not immediately repeat', () => {
  const draft = createEmptyProfileDraft()
  const ids = selectProfileQuestionIds(draft, ['heightCm'], ['baselineWeightKg'])
  assert.ok(!ids.includes('heightCm'))
  assert.ok(!ids.includes('baselineWeightKg'))
})

test('training frequency is represented by one compound question', () => {
  const draft = createEmptyProfileDraft()
  draft.facts.heightCm = 172
  draft.facts.baselineWeightKg = 78
  draft.facts.age = 20
  draft.facts.primaryGoal = 'fat-loss'
  draft.facts.activityLevel = 'moderate'
  draft.facts.sexForEnergyEstimate = 'male'
  const ids = selectProfileQuestionIds(draft)
  assert.ok(ids.includes('trainingFrequency'))
  draft.facts.strengthSessionsPerWeek = 3
  assert.ok(!selectProfileQuestionIds(draft).includes('trainingFrequency'))
})

test('health limitations are asked only when the parsed draft marks them unknown', () => {
  const draft = createEmptyProfileDraft()
  draft.facts.heightCm = 172
  draft.facts.baselineWeightKg = 78
  draft.facts.age = 20
  draft.facts.primaryGoal = 'fat-loss'
  draft.facts.activityLevel = 'moderate'
  draft.facts.sexForEnergyEstimate = 'male'
  draft.facts.strengthSessionsPerWeek = 3
  draft.facts.averageSleepHours = 7
  assert.ok(!selectProfileQuestionIds(draft).includes('healthLimitations'))
  draft.unknowns = ['是否存在健康或伤病限制未说明']
  assert.ok(selectProfileQuestionIds(draft).includes('healthLimitations'))
})

test('a complete draft has no required question and navigation reaches review', () => {
  const draft = createEmptyProfileDraft()
  draft.facts.heightCm = 172
  draft.facts.baselineWeightKg = 78
  draft.facts.age = 20
  draft.facts.primaryGoal = 'fat-loss'
  draft.facts.activityLevel = 'moderate'
  draft.facts.sexForEnergyEstimate = 'male'
  draft.facts.strengthSessionsPerWeek = 3
  draft.facts.averageSleepHours = 7
  draft.facts.healthLimitations = ['无需要记录的限制']
  const ids = selectProfileQuestionIds(draft)
  assert.deepEqual(ids, [])
  assert.equal(getNextProfileQuestionId([], null), null)
})

test('question navigation supports previous and next without expanding the queue', () => {
  const ids = ['heightCm', 'baselineWeightKg', 'age'] as const
  assert.equal(getNextProfileQuestionId([...ids], 'heightCm'), 'baselineWeightKg')
  assert.equal(getNextProfileQuestionId([...ids], 'age'), null)
  assert.equal(getPreviousProfileQuestionId([...ids], 'age'), 'baselineWeightKg')
  assert.equal(getPreviousProfileQuestionId([...ids], 'heightCm'), null)
})
