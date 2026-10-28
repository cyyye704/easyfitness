import type { UserProfile } from '../profile/types.js'
import { normalizeUserProfile } from '../profile/validation.js'
import type { DailyRecord } from '../types.js'
import { isDateKey } from '../utils.js'
import { CloudDataError } from './types.js'
import type { Versioned } from './types.js'

export const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const invalid = (): never => {
  throw new CloudDataError('invalid', '云端记录格式无法识别，原数据未被覆盖。')
}

const isText = (value: unknown): value is string => typeof value === 'string'
const isNonemptyText = (value: unknown): value is string =>
  isText(value) && value.trim().length > 0

const isNumber = (value: unknown, maximum = Number.POSITIVE_INFINITY): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= maximum

const isNullableNumber = (value: unknown, maximum = Number.POSITIVE_INFINITY) =>
  value === null || isNumber(value, maximum)

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(isText)

export const validateRevision = (value: unknown): number => {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    return invalid()
  }
  return value as number
}

export const parseDailyRecord = (value: unknown, expectedDate?: string): DailyRecord => {
  if (
    !isObject(value) ||
    !isText(value.date) ||
    !isDateKey(value.date) ||
    (expectedDate !== undefined && value.date !== expectedDate) ||
    !isNullableNumber(value.weightKg) ||
    !isNullableNumber(value.sleepHours, 24) ||
    !isText(value.training) ||
    !Array.isArray(value.foods) ||
    !Array.isArray(value.unestimatedMeals)
  ) {
    return invalid()
  }

  const foodIds = new Set<string>()
  const foods = value.foods.map((food: unknown) => {
    if (
      !isObject(food) ||
      !isNonemptyText(food.id) ||
      foodIds.has(food.id) ||
      !isNonemptyText(food.name) ||
      !isNumber(food.calories) ||
      !isNumber(food.protein)
    ) {
      return invalid()
    }
    foodIds.add(food.id)
    return { id: food.id, name: food.name, calories: food.calories, protein: food.protein }
  })
  const mealIds = new Set<string>()
  const unestimatedMeals = value.unestimatedMeals.map((meal: unknown) => {
    if (
      !isObject(meal) ||
      !isNonemptyText(meal.id) ||
      mealIds.has(meal.id) ||
      !isNonemptyText(meal.description) ||
      !isText(meal.reason)
    ) {
      return invalid()
    }
    mealIds.add(meal.id)
    return { id: meal.id, description: meal.description, reason: meal.reason }
  })

  return {
    date: value.date,
    weightKg: value.weightKg as number | null,
    sleepHours: value.sleepHours as number | null,
    training: value.training,
    foods,
    unestimatedMeals,
  }
}

const isTimestamp = (value: unknown): value is string =>
  isNonemptyText(value) && Number.isFinite(Date.parse(value))

export const parseUserProfile = (value: unknown): UserProfile => {
  if (
    !isObject(value) ||
    value.version !== 1 ||
    !isNonemptyText(value.id) ||
    !isTimestamp(value.createdAt) ||
    !isTimestamp(value.updatedAt) ||
    !isObject(value.facts) ||
    !isObject(value.estimates) ||
    !isObject(value.onboarding) ||
    value.onboarding.completed !== true ||
    value.onboarding.source !== 'natural-language' ||
    !isTimestamp(value.onboarding.completedAt) ||
    !isStringArray(value.onboarding.answeredQuestionIds) ||
    !isStringArray(value.onboarding.skippedQuestionIds)
  ) {
    return invalid()
  }

  const facts = value.facts
  const numberFields = [
    'age', 'heightCm', 'baselineWeightKg', 'waistCm',
    'strengthSessionsPerWeek', 'cardioSessionsPerWeek', 'averageSleepHours',
  ] as const
  const enumFields = [
    'sexForEnergyEstimate', 'primaryGoal', 'activityLevel', 'trainingExperience',
  ] as const
  if (
    numberFields.some((key) => !isNullableNumber(facts[key])) ||
    enumFields.some((key) => !isText(facts[key])) ||
    !isStringArray(facts.healthLimitations) ||
    !isStringArray(facts.dietaryPreferences) ||
    !isText(facts.notes)
  ) {
    return invalid()
  }

  const estimate = value.estimates.bodyFatPercentRange
  if (
    estimate !== null &&
    (!isObject(estimate) ||
      !isNumber(estimate.min, 70) || estimate.min < 1 ||
      !isNumber(estimate.max, 70) || estimate.max < estimate.min ||
      !['high', 'medium', 'low'].includes(String(estimate.confidence)) ||
      !isStringArray(estimate.basis))
  ) {
    return invalid()
  }

  try {
    const normalized = normalizeUserProfile(value)
    if (
      numberFields.some((key) => normalized.facts[key] !== facts[key]) ||
      enumFields.some((key) => normalized.facts[key] !== facts[key]) ||
      normalized.onboarding.answeredQuestionIds.length !== value.onboarding.answeredQuestionIds.length ||
      normalized.onboarding.skippedQuestionIds.length !== value.onboarding.skippedQuestionIds.length ||
      normalized.onboarding.answeredQuestionIds.some((id) =>
        normalized.onboarding.skippedQuestionIds.includes(id),
      )
    ) {
      return invalid()
    }
    return normalized
  } catch {
    return invalid()
  }
}

export const parseCloudRecordRow = (
  value: unknown,
  userId: string,
): Versioned<DailyRecord> => {
  if (!isObject(value) || value.user_id !== userId || !isText(value.date)) {
    return invalid()
  }
  return {
    data: parseDailyRecord(value.data, value.date),
    revision: validateRevision(value.revision),
  }
}

export const parseCloudProfileRow = (
  value: unknown,
  userId: string,
): Versioned<UserProfile> => {
  if (!isObject(value) || value.user_id !== userId) {
    return invalid()
  }
  return { data: parseUserProfile(value.data), revision: validateRevision(value.revision) }
}
