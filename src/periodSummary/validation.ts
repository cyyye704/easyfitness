import {
  DeepSeekResponseError,
  parseDeepSeekJsonObject,
} from '../ai/validation.js'
import { isDateKey } from '../utils.js'
import {
  countPeriodDays,
  MAX_PERIOD_DAYS,
} from './calculatePeriodSummary.js'
import type {
  PeriodAiSummary,
  PeriodSummaryApiResponse,
  PeriodSummaryMetrics,
  WeightTrendMethod,
} from './types.js'

export class PeriodSummaryValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PeriodSummaryValidationError'
  }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const isIntegerInRange = (value: unknown, minimum: number, maximum: number) =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value >= minimum &&
  value <= maximum

const isNullableFiniteInRange = (
  value: unknown,
  minimum: number,
  maximum: number,
) =>
  value === null ||
  (typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum)

const isWeightMethod = (value: unknown): value is WeightTrendMethod =>
  value === 'insufficient' ||
  value === 'endpoints' ||
  value === 'three-point-average'

const normalizeStrings = (
  value: unknown,
  options: { minimum: number; maximum: number; itemMaximum: number },
) => {
  if (!Array.isArray(value)) {
    throw new PeriodSummaryValidationError('Expected a string array')
  }
  const strings = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().slice(0, options.itemMaximum))
    .filter(Boolean)
    .slice(0, options.maximum)
  if (strings.length < options.minimum) {
    throw new PeriodSummaryValidationError('String array is incomplete')
  }
  return strings
}

export const normalizePeriodSummaryMetrics = (
  value: unknown,
): PeriodSummaryMetrics => {
  if (
    !isObject(value) ||
    !isObject(value.range) ||
    !isObject(value.coverage) ||
    !isObject(value.weight) ||
    !isObject(value.nutrition) ||
    !isObject(value.training) ||
    !isObject(value.sleep)
  ) {
    throw new PeriodSummaryValidationError('Period metrics are incomplete')
  }

  const { range, coverage, weight, nutrition, training, sleep } = value
  const startDate = range.startDate
  const endDate = range.endDate
  if (
    typeof startDate !== 'string' ||
    typeof endDate !== 'string' ||
    !isDateKey(startDate) ||
    !isDateKey(endDate)
  ) {
    throw new PeriodSummaryValidationError('Period dates are invalid')
  }

  const totalDays = countPeriodDays(startDate, endDate)
  if (
    totalDays < 1 ||
    totalDays > MAX_PERIOD_DAYS ||
    range.totalDays !== totalDays ||
    !isIntegerInRange(coverage.recordedDays, 0, totalDays) ||
    !isIntegerInRange(weight.readingCount, 0, totalDays) ||
    !isNullableFiniteInRange(weight.startKg, 0, 1000) ||
    !isNullableFiniteInRange(weight.endKg, 0, 1000) ||
    !isNullableFiniteInRange(weight.changeKg, -1000, 1000) ||
    !isWeightMethod(weight.method) ||
    !isIntegerInRange(nutrition.recordedDays, 0, totalDays) ||
    !isNullableFiniteInRange(nutrition.averageCalories, 0, 100_000) ||
    !isNullableFiniteInRange(nutrition.averageProtein, 0, 10_000) ||
    !isIntegerInRange(nutrition.unestimatedMealCount, 0, 1000) ||
    !isIntegerInRange(nutrition.daysWithUnestimatedMeals, 0, totalDays) ||
    !isIntegerInRange(training.days, 0, totalDays) ||
    !isIntegerInRange(sleep.recordedDays, 0, totalDays) ||
    !isNullableFiniteInRange(sleep.averageHours, 0, 24) ||
    !isIntegerInRange(sleep.atLeastSevenHoursDays, 0, totalDays) ||
    !isIntegerInRange(sleep.underSixHoursDays, 0, totalDays)
  ) {
    throw new PeriodSummaryValidationError('Period metric values are invalid')
  }

  const recordedDays = coverage.recordedDays as number
  const weightReadingCount = weight.readingCount as number
  const nutritionRecordedDays = nutrition.recordedDays as number
  const daysWithUnestimatedMeals = nutrition.daysWithUnestimatedMeals as number
  const unestimatedMealCount = nutrition.unestimatedMealCount as number
  const trainingDays = training.days as number
  const sleepRecordedDays = sleep.recordedDays as number
  const atLeastSevenHoursDays = sleep.atLeastSevenHoursDays as number
  const underSixHoursDays = sleep.underSixHoursDays as number

  if (
    weightReadingCount > recordedDays ||
    nutritionRecordedDays > recordedDays ||
    daysWithUnestimatedMeals > recordedDays ||
    trainingDays > recordedDays ||
    sleepRecordedDays > recordedDays ||
    atLeastSevenHoursDays > sleepRecordedDays ||
    underSixHoursDays > sleepRecordedDays ||
    atLeastSevenHoursDays + underSixHoursDays > sleepRecordedDays ||
    (unestimatedMealCount === 0 && daysWithUnestimatedMeals !== 0) ||
    (unestimatedMealCount > 0 && daysWithUnestimatedMeals === 0) ||
    (nutritionRecordedDays === 0 &&
      (nutrition.averageCalories !== null || nutrition.averageProtein !== null)) ||
    (nutritionRecordedDays > 0 &&
      (nutrition.averageCalories === null || nutrition.averageProtein === null))
  ) {
    throw new PeriodSummaryValidationError('Period metric counts are inconsistent')
  }

  if (
    (weight.method === 'insufficient' &&
      (weightReadingCount >= 2 ||
        weight.startKg !== null ||
        weight.endKg !== null ||
        weight.changeKg !== null)) ||
    (weight.method !== 'insufficient' &&
      (weightReadingCount < 2 ||
        weight.startKg === null ||
        weight.endKg === null ||
        weight.changeKg === null)) ||
    (weight.method === 'endpoints' && weightReadingCount >= 6) ||
    (weight.method === 'three-point-average' && weightReadingCount < 6)
  ) {
    throw new PeriodSummaryValidationError('Weight trend values are inconsistent')
  }

  return {
    range: { startDate, endDate, totalDays },
    coverage: { recordedDays },
    weight: {
      readingCount: weightReadingCount,
      startKg: weight.startKg as number | null,
      endKg: weight.endKg as number | null,
      changeKg: weight.changeKg as number | null,
      method: weight.method,
    },
    nutrition: {
      recordedDays: nutritionRecordedDays,
      averageCalories: nutrition.averageCalories as number | null,
      averageProtein: nutrition.averageProtein as number | null,
      unestimatedMealCount,
      daysWithUnestimatedMeals,
    },
    training: { days: trainingDays },
    sleep: {
      recordedDays: sleepRecordedDays,
      averageHours: sleep.averageHours as number | null,
      atLeastSevenHoursDays,
      underSixHoursDays,
    },
    limitations: normalizeStrings(value.limitations, {
      minimum: 0,
      maximum: 6,
      itemMaximum: 200,
    }),
  }
}

export const normalizePeriodAiSummary = (value: unknown): PeriodAiSummary => {
  if (
    !isObject(value) ||
    typeof value.headline !== 'string' ||
    typeof value.focus !== 'string'
  ) {
    throw new PeriodSummaryValidationError('AI summary is incomplete')
  }
  const headline = value.headline.trim().slice(0, 100)
  const focus = value.focus.trim().slice(0, 160)
  if (!headline || !focus) {
    throw new PeriodSummaryValidationError('AI summary text is empty')
  }

  return {
    headline,
    observations: normalizeStrings(value.observations, {
      minimum: 1,
      maximum: 4,
      itemMaximum: 160,
    }),
    focus,
    limitations: normalizeStrings(value.limitations, {
      minimum: 0,
      maximum: 4,
      itemMaximum: 160,
    }),
  }
}

export const parseDeepSeekPeriodSummaryCompletion = (payload: unknown) => {
  const parsed = parseDeepSeekJsonObject(payload)
  try {
    return normalizePeriodAiSummary(parsed)
  } catch (error) {
    if (error instanceof PeriodSummaryValidationError) {
      throw new DeepSeekResponseError('invalid_structure', error.message)
    }
    throw error
  }
}

export const parsePeriodSummaryApiResponse = (
  value: unknown,
): PeriodSummaryApiResponse => {
  if (!isObject(value) || !('summary' in value)) {
    throw new PeriodSummaryValidationError('Summary response is incomplete')
  }
  return { summary: normalizePeriodAiSummary(value.summary) }
}
