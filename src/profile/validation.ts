import {
  DeepSeekResponseError,
  parseDeepSeekJsonObject,
} from '../ai/validation.js'
import type {
  ActivityLevel,
  BodyFatEstimate,
  EnergyEstimateSex,
  PrimaryGoal,
  ProfileConfidence,
  ProfileQuestionId,
  StoredProfileDraft,
  TrainingExperience,
  UserProfile,
  UserProfileDraft,
  UserProfileFacts,
} from './types.js'
import {
  PROFILE_MAX_QUESTIONS,
  PROFILE_TEXT_MAX_LENGTH,
} from './types.js'

export class ProfileValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProfileValidationError'
  }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const truncate = (value: string, maximum: number) => value.trim().slice(0, maximum)

const normalizeNullableNumber = (
  value: unknown,
  minimum: number,
  maximum: number,
  integer = false,
) => {
  if (value === null || value === undefined || value === '') {
    return null
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null
  }
  if (value < minimum || value > maximum || (integer && !Number.isInteger(value))) {
    return null
  }
  return value
}

const normalizeStringArray = (
  value: unknown,
  maximumItems: number,
  maximumLength: number,
) => {
  if (!Array.isArray(value)) {
    return []
  }
  const seen = new Set<string>()
  return value
    .flatMap((item) => {
      if (typeof item !== 'string') {
        return []
      }
      const normalized = truncate(item, maximumLength)
      const key = normalized.toLocaleLowerCase()
      if (!normalized || seen.has(key)) {
        return []
      }
      seen.add(key)
      return [normalized]
    })
    .slice(0, maximumItems)
}

const normalizeSex = (value: unknown): EnergyEstimateSex =>
  value === 'male' || value === 'female' ? value : 'unspecified'

const normalizeGoal = (value: unknown): PrimaryGoal =>
  value === 'fat-loss' ||
  value === 'muscle-gain' ||
  value === 'maintenance' ||
  value === 'fitness'
    ? value
    : 'unsure'

const normalizeActivity = (value: unknown): ActivityLevel =>
  value === 'sedentary' ||
  value === 'light' ||
  value === 'moderate' ||
  value === 'high'
    ? value
    : 'unsure'

const normalizeExperience = (value: unknown): TrainingExperience =>
  value === 'beginner' || value === 'intermediate' || value === 'advanced'
    ? value
    : 'unsure'

const normalizeConfidence = (value: unknown): ProfileConfidence =>
  value === 'high' || value === 'medium' ? value : 'low'

export const createEmptyProfileFacts = (): UserProfileFacts => ({
  age: null,
  sexForEnergyEstimate: 'unspecified',
  heightCm: null,
  baselineWeightKg: null,
  waistCm: null,
  primaryGoal: 'unsure',
  activityLevel: 'unsure',
  trainingExperience: 'unsure',
  strengthSessionsPerWeek: null,
  cardioSessionsPerWeek: null,
  averageSleepHours: null,
  healthLimitations: [],
  dietaryPreferences: [],
  notes: '',
})

export const createEmptyProfileDraft = (): UserProfileDraft => ({
  facts: createEmptyProfileFacts(),
  estimates: { bodyFatPercentRange: null },
  unknowns: [],
})

const normalizeBodyFatEstimate = (value: unknown): BodyFatEstimate | null => {
  if (!isObject(value)) {
    return null
  }
  const min = normalizeNullableNumber(value.min, 1, 70)
  const max = normalizeNullableNumber(value.max, 1, 70)
  if (min === null || max === null) {
    return null
  }
  return {
    min: Math.min(min, max),
    max: Math.max(min, max),
    confidence: normalizeConfidence(value.confidence),
    basis: normalizeStringArray(value.basis, 5, 120),
  }
}

export const normalizeProfileDraft = (value: unknown): UserProfileDraft => {
  if (!isObject(value) || !isObject(value.facts) || !isObject(value.estimates)) {
    throw new ProfileValidationError('Profile draft root is incomplete')
  }
  const facts = value.facts
  return {
    facts: {
      age: normalizeNullableNumber(facts.age, 13, 120, true),
      sexForEnergyEstimate: normalizeSex(facts.sexForEnergyEstimate),
      heightCm: normalizeNullableNumber(facts.heightCm, 100, 250),
      baselineWeightKg: normalizeNullableNumber(
        facts.baselineWeightKg,
        25,
        400,
      ),
      waistCm: normalizeNullableNumber(facts.waistCm, 30, 250),
      primaryGoal: normalizeGoal(facts.primaryGoal),
      activityLevel: normalizeActivity(facts.activityLevel),
      trainingExperience: normalizeExperience(facts.trainingExperience),
      strengthSessionsPerWeek: normalizeNullableNumber(
        facts.strengthSessionsPerWeek,
        0,
        14,
      ),
      cardioSessionsPerWeek: normalizeNullableNumber(
        facts.cardioSessionsPerWeek,
        0,
        14,
      ),
      averageSleepHours: normalizeNullableNumber(
        facts.averageSleepHours,
        0,
        24,
      ),
      healthLimitations: normalizeStringArray(facts.healthLimitations, 10, 120),
      dietaryPreferences: normalizeStringArray(
        facts.dietaryPreferences,
        10,
        120,
      ),
      notes: typeof facts.notes === 'string' ? truncate(facts.notes, 500) : '',
    },
    estimates: {
      bodyFatPercentRange: normalizeBodyFatEstimate(
        value.estimates.bodyFatPercentRange,
      ),
    },
    unknowns: normalizeStringArray(value.unknowns, 10, 160),
  }
}

export const parseDeepSeekProfileCompletion = (payload: unknown) => {
  const parsed = parseDeepSeekJsonObject(payload)
  try {
    return normalizeProfileDraft(parsed)
  } catch (error) {
    if (error instanceof ProfileValidationError) {
      throw new DeepSeekResponseError('invalid_structure', error.message)
    }
    throw error
  }
}

export const parseProfileApiResponse = (value: unknown): UserProfileDraft => {
  if (!isObject(value) || !('draft' in value)) {
    throw new ProfileValidationError('Profile service response is incomplete')
  }
  return normalizeProfileDraft(value.draft)
}

export const getProfileInputError = (text: string) => {
  const normalized = text.trim()
  if (!normalized) {
    return '请先简单描述你的身体状态、运动习惯或目标。'
  }
  if (normalized.length > PROFILE_TEXT_MAX_LENGTH) {
    return `内容不能超过 ${PROFILE_TEXT_MAX_LENGTH} 个字符。`
  }
  return null
}

export const hasProfileDraftContent = (draft: UserProfileDraft) => {
  const facts = draft.facts
  return (
    facts.age !== null ||
    facts.sexForEnergyEstimate !== 'unspecified' ||
    facts.heightCm !== null ||
    facts.baselineWeightKg !== null ||
    facts.waistCm !== null ||
    facts.primaryGoal !== 'unsure' ||
    facts.activityLevel !== 'unsure' ||
    facts.trainingExperience !== 'unsure' ||
    facts.strengthSessionsPerWeek !== null ||
    facts.cardioSessionsPerWeek !== null ||
    facts.averageSleepHours !== null ||
    facts.healthLimitations.length > 0 ||
    facts.dietaryPreferences.length > 0 ||
    facts.notes.length > 0 ||
    draft.estimates.bodyFatPercentRange !== null
  )
}

export const createProfileId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `profile-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export const createUserProfile = (
  draft: UserProfileDraft,
  answeredQuestionIds: ProfileQuestionId[],
  skippedQuestionIds: ProfileQuestionId[],
  existingProfile: UserProfile | null = null,
): UserProfile => {
  const normalized = normalizeProfileDraft(draft)
  const now = new Date().toISOString()
  return {
    version: 1,
    id: existingProfile?.id ?? createProfileId(),
    createdAt: existingProfile?.createdAt ?? now,
    updatedAt: now,
    facts: normalized.facts,
    estimates: normalized.estimates,
    onboarding: {
      completed: true,
      completedAt: existingProfile?.onboarding.completedAt ?? now,
      answeredQuestionIds: normalizeQuestionIds(answeredQuestionIds),
      skippedQuestionIds: normalizeQuestionIds(skippedQuestionIds),
      source: 'natural-language',
    },
  }
}

const profileQuestionIds: ProfileQuestionId[] = [
  'age',
  'sexForEnergyEstimate',
  'heightCm',
  'baselineWeightKg',
  'primaryGoal',
  'activityLevel',
  'trainingFrequency',
  'averageSleepHours',
  'healthLimitations',
]

const isProfileQuestionId = (value: unknown): value is ProfileQuestionId =>
  typeof value === 'string' && profileQuestionIds.includes(value as ProfileQuestionId)

export const normalizeQuestionIds = (value: unknown) => {
  if (!Array.isArray(value)) {
    return []
  }
  return [...new Set(value.filter(isProfileQuestionId))]
}

export const normalizeUserProfile = (value: unknown): UserProfile => {
  if (
    !isObject(value) ||
    value.version !== 1 ||
    typeof value.id !== 'string' ||
    typeof value.createdAt !== 'string' ||
    typeof value.updatedAt !== 'string' ||
    !isObject(value.onboarding)
  ) {
    throw new ProfileValidationError('Stored profile root is invalid')
  }
  const draft = normalizeProfileDraft({
    facts: isObject(value.facts) ? value.facts : {},
    estimates: isObject(value.estimates) ? value.estimates : {},
    unknowns: [],
  })
  return {
    version: 1,
    id: truncate(value.id, 160),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    facts: draft.facts,
    estimates: draft.estimates,
    onboarding: {
      completed: true,
      completedAt:
        typeof value.onboarding.completedAt === 'string'
          ? value.onboarding.completedAt
          : value.updatedAt,
      answeredQuestionIds: normalizeQuestionIds(
        value.onboarding.answeredQuestionIds,
      ),
      skippedQuestionIds: normalizeQuestionIds(
        value.onboarding.skippedQuestionIds,
      ),
      source: 'natural-language',
    },
  }
}

export const normalizeStoredProfileDraft = (value: unknown): StoredProfileDraft => {
  if (!isObject(value) || value.version !== 1) {
    throw new ProfileValidationError('Stored profile draft root is invalid')
  }
  const requestedStage =
    value.stage === 'questions' || value.stage === 'review' ? value.stage : 'intro'
  const questionIds = normalizeQuestionIds(value.questionIds).slice(
    0,
    PROFILE_MAX_QUESTIONS,
  )
  const parsedDraft =
    value.parsedDraft === null || value.parsedDraft === undefined
      ? null
      : normalizeProfileDraft(value.parsedDraft)
  const stage = parsedDraft ? requestedStage : 'intro'
  const currentQuestionId =
    stage === 'questions'
      ? isProfileQuestionId(value.currentQuestionId)
        ? value.currentQuestionId
        : questionIds[0] ?? null
      : null
  return {
    version: 1,
    stage,
    rawText:
      typeof value.rawText === 'string'
        ? value.rawText.slice(0, PROFILE_TEXT_MAX_LENGTH)
        : '',
    parsedDraft,
    questionIds,
    answeredQuestionIds: normalizeQuestionIds(value.answeredQuestionIds),
    skippedQuestionIds: normalizeQuestionIds(value.skippedQuestionIds),
    currentQuestionId,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : '',
  }
}
