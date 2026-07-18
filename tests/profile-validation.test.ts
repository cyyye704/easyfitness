import assert from 'node:assert/strict'
import test from 'node:test'
import { DeepSeekResponseError } from '../src/ai/validation.ts'
import {
  normalizeProfileDraft,
  parseDeepSeekProfileCompletion,
  ProfileValidationError,
} from '../src/profile/validation.ts'

const rawDraft = (facts: Record<string, unknown> = {}, estimates: unknown = {}) => ({
  facts: {
    age: 20,
    sexForEnergyEstimate: 'male',
    heightCm: 172,
    baselineWeightKg: 78,
    waistCm: null,
    primaryGoal: 'fat-loss',
    activityLevel: 'sedentary',
    trainingExperience: 'intermediate',
    strengthSessionsPerWeek: 3,
    cardioSessionsPerWeek: 1,
    averageSleepHours: 7,
    healthLimitations: [],
    dietaryPreferences: [],
    notes: '希望保持力量',
    ...facts,
  },
  estimates: {
    bodyFatPercentRange: null,
    ...(estimates as object),
  },
  unknowns: [],
})

const completion = (content: unknown) => ({
  choices: [
    {
      finish_reason: 'stop',
      message: { content: typeof content === 'string' ? content : JSON.stringify(content) },
    },
  ],
})

test('valid profile model JSON becomes a normalized draft', () => {
  const draft = parseDeepSeekProfileCompletion(completion(rawDraft()))
  assert.equal(draft.facts.heightCm, 172)
  assert.equal(draft.facts.primaryGoal, 'fat-loss')
  assert.equal(draft.estimates.bodyFatPercentRange, null)
})

test('invalid roots are rejected while missing optional fields receive defaults', () => {
  assert.throws(() => normalizeProfileDraft(null), ProfileValidationError)
  assert.throws(
    () => normalizeProfileDraft({ facts: {} }),
    ProfileValidationError,
  )
  const draft = normalizeProfileDraft({ facts: {}, estimates: {}, unknowns: [] })
  assert.equal(draft.facts.age, null)
  assert.equal(draft.facts.sexForEnergyEstimate, 'unspecified')
  assert.equal(draft.facts.primaryGoal, 'unsure')
  assert.deepEqual(draft.facts.healthLimitations, [])
})

test('unsafe profile numbers and non-finite values normalize to null', () => {
  const draft = normalizeProfileDraft(
    rawDraft({
      age: 12,
      heightCm: 999,
      baselineWeightKg: Number.NaN,
      averageSleepHours: 25,
      strengthSessionsPerWeek: Number.POSITIVE_INFINITY,
      cardioSessionsPerWeek: -1,
    }),
  )
  assert.equal(draft.facts.age, null)
  assert.equal(draft.facts.heightCm, null)
  assert.equal(draft.facts.baselineWeightKg, null)
  assert.equal(draft.facts.averageSleepHours, null)
  assert.equal(draft.facts.strengthSessionsPerWeek, null)
  assert.equal(draft.facts.cardioSessionsPerWeek, null)
})

test('invalid profile enums fall back to unsure or unspecified', () => {
  const draft = normalizeProfileDraft(
    rawDraft({
      sexForEnergyEstimate: 'other-value',
      primaryGoal: 'rapid-loss',
      activityLevel: 'athlete',
      trainingExperience: 'expert',
    }),
  )
  assert.equal(draft.facts.sexForEnergyEstimate, 'unspecified')
  assert.equal(draft.facts.primaryGoal, 'unsure')
  assert.equal(draft.facts.activityLevel, 'unsure')
  assert.equal(draft.facts.trainingExperience, 'unsure')
})

test('body-fat ranges swap reversed bounds and reject invalid endpoints', () => {
  const swapped = normalizeProfileDraft(
    rawDraft({}, {
      bodyFatPercentRange: {
        min: 24,
        max: 20,
        confidence: 'low',
        basis: ['用户自述'],
      },
    }),
  )
  assert.deepEqual(swapped.estimates.bodyFatPercentRange?.min, 20)
  assert.deepEqual(swapped.estimates.bodyFatPercentRange?.max, 24)

  const invalid = normalizeProfileDraft(
    rawDraft({}, {
      bodyFatPercentRange: {
        min: 0,
        max: 22,
        confidence: 'high',
        basis: [],
      },
    }),
  )
  assert.equal(invalid.estimates.bodyFatPercentRange, null)
})

test('missing body-fat information is never synthesized from height and weight', () => {
  const draft = normalizeProfileDraft(rawDraft())
  assert.equal(draft.estimates.bodyFatPercentRange, null)
})

test('profile arrays are deduplicated and text and unknown counts are bounded', () => {
  const draft = normalizeProfileDraft({
    ...rawDraft({
      healthLimitations: ['膝盖旧伤', '膝盖旧伤', 'a'.repeat(200)],
      notes: 'n'.repeat(700),
    }),
    unknowns: Array.from({ length: 20 }, (_, index) => `未知 ${index}`),
  })
  assert.equal(draft.facts.healthLimitations.length, 2)
  assert.equal(draft.facts.healthLimitations[1].length, 120)
  assert.equal(draft.facts.notes.length, 500)
  assert.equal(draft.unknowns.length, 10)
})

test('DeepSeek empty, invalid JSON and invalid profile structure stay classified', () => {
  assert.throws(
    () => parseDeepSeekProfileCompletion(completion('')),
    (error) => error instanceof DeepSeekResponseError && error.kind === 'empty_content',
  )
  assert.throws(
    () => parseDeepSeekProfileCompletion(completion('{')),
    (error) => error instanceof DeepSeekResponseError && error.kind === 'invalid_json',
  )
  assert.throws(
    () => parseDeepSeekProfileCompletion(completion({ facts: {} })),
    (error) => error instanceof DeepSeekResponseError && error.kind === 'invalid_structure',
  )
})
