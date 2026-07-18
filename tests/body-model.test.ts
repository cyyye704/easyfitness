import assert from 'node:assert/strict'
import test from 'node:test'
import { buildBodyModel } from '../src/profile/buildBodyModel.ts'
import type { UserProfile } from '../src/profile/types.ts'
import { createEmptyProfileDraft, createUserProfile } from '../src/profile/validation.ts'
import { createEmptyRecord } from '../src/utils.ts'

const profileWith = (
  patch: Partial<ReturnType<typeof createEmptyProfileDraft>['facts']>,
  answered: UserProfile['onboarding']['answeredQuestionIds'] = [],
) => {
  const draft = createEmptyProfileDraft()
  draft.facts = { ...draft.facts, ...patch }
  return createUserProfile(draft, answered, [])
}

test('latest daily weight takes priority over the preserved profile baseline', () => {
  const profile = profileWith({ heightCm: 172, baselineWeightKg: 78, primaryGoal: 'fat-loss' })
  const older = { ...createEmptyRecord('2026-07-10'), weightKg: 77 }
  const latest = { ...createEmptyRecord('2026-07-18'), weightKg: 76.5 }
  const model = buildBodyModel(profile, { older, latest })
  assert.equal(model.currentWeightKg, 76.5)
  assert.equal(model.currentWeightSource, 'latest-daily-record')
  assert.equal(profile.facts.baselineWeightKg, 78)
})

test('current weight falls back to baseline and then missing', () => {
  const baseline = buildBodyModel(
    profileWith({ baselineWeightKg: 78 }),
    {},
  )
  assert.equal(baseline.currentWeightKg, 78)
  assert.equal(baseline.currentWeightSource, 'profile-baseline')
  const missing = buildBodyModel(profileWith({ baselineWeightKg: null }), {})
  assert.equal(missing.currentWeightKg, null)
  assert.equal(missing.currentWeightSource, 'missing')
})

test('BMI is calculated to one decimal only when height and weight exist', () => {
  const complete = buildBodyModel(
    profileWith({ heightCm: 172, baselineWeightKg: 78 }),
    {},
  )
  assert.equal(complete.bmi, 26.4)
  assert.equal(buildBodyModel(profileWith({ baselineWeightKg: 78 }), {}).bmi, null)
  assert.equal(buildBodyModel(profileWith({ heightCm: 172 }), {}).bmi, null)
})

test('body model levels follow insufficient, basic, usable and enhanced rules', () => {
  assert.equal(buildBodyModel(profileWith({ primaryGoal: 'fat-loss' }), {}).level, 'insufficient')
  assert.equal(
    buildBodyModel(
      profileWith({ heightCm: 172, baselineWeightKg: 78, primaryGoal: 'fat-loss' }),
      {},
    ).level,
    'basic',
  )
  assert.equal(
    buildBodyModel(
      profileWith({
        heightCm: 172,
        baselineWeightKg: 78,
        primaryGoal: 'fat-loss',
        age: 20,
        activityLevel: 'moderate',
      }),
      {},
    ).level,
    'usable',
  )
  assert.equal(
    buildBodyModel(
      profileWith(
        {
          heightCm: 172,
          baselineWeightKg: 78,
          primaryGoal: 'fat-loss',
          age: 20,
          activityLevel: 'moderate',
          strengthSessionsPerWeek: 3,
          averageSleepHours: 7,
        },
        ['trainingFrequency', 'averageSleepHours'],
      ),
      {},
    ).level,
    'enhanced',
  )
})

test('missing important fields and neutral health cautions are deterministic', () => {
  const model = buildBodyModel(
    profileWith({ healthLimitations: ['正在接受慢性疾病治疗'] }),
    {},
  )
  assert.ok(model.missingImportantFields.includes('身高'))
  assert.ok(model.missingImportantFields.includes('当前体重'))
  assert.equal(model.cautions.length, 2)
  assert.match(model.cautions[1], /不替代专业医疗建议/)
})

test('building a body model does not mutate profile or records', () => {
  const profile = profileWith({ heightCm: 172, baselineWeightKg: 78 })
  const records = { one: { ...createEmptyRecord('2026-07-18'), weightKg: 76 } }
  const beforeProfile = structuredClone(profile)
  const beforeRecords = structuredClone(records)
  buildBodyModel(profile, records)
  assert.deepEqual(profile, beforeProfile)
  assert.deepEqual(records, beforeRecords)
})
