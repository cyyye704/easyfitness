import type { AiDailyDraft, AiFoodDraft, AiMergeOptions } from './types.ts'
import type { DailyRecord, FoodItem, UnestimatedMeal } from '../types.ts'
import {
  createFoodId,
  createUnestimatedMealId,
  roundToOneDecimal,
} from '../utils.ts'

const normalizeDraftNumber = (
  value: number | null,
  maximum = Number.POSITIVE_INFINITY,
) =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= maximum
    ? value
    : null

export const mergeFoodNameAndAmount = (name: string, amountText: string) => {
  const normalizedName = name.trim()
  const normalizedAmount = amountText.trim()

  if (!normalizedName || !normalizedAmount) {
    return normalizedName
  }

  const suffix = `（${normalizedAmount}）`
  return normalizedName.endsWith(suffix) ? normalizedName : `${normalizedName}${suffix}`
}

const toFoodItem = (food: AiFoodDraft): FoodItem | null => {
  const name = mergeFoodNameAndAmount(food.name, food.amountText)
  const calories = normalizeDraftNumber(food.calories)
  const protein = normalizeDraftNumber(food.protein)

  if (!name || (calories === null && protein === null)) {
    return null
  }

  return {
    id: createFoodId(),
    name,
    calories: calories === null ? 0 : Math.round(calories),
    protein: protein === null ? 0 : roundToOneDecimal(protein),
  }
}

const toUnestimatedMeal = (
  meal: AiDailyDraft['unestimatedMeals'][number],
): UnestimatedMeal | null => {
  const description = meal.description.trim()
  if (!description) {
    return null
  }

  return {
    id: createUnestimatedMealId(),
    description,
    reason: meal.reason.trim(),
  }
}

export const mergeTrainingText = (currentTraining: string, draftTraining: string) => {
  const current = currentTraining.trim()
  const draft = draftTraining.trim()

  if (!draft || draft === current) {
    return current
  }
  if (!current) {
    return draft
  }
  return `${current}\n${draft}`
}

export const hasSaveableAiDraft = (draft: AiDailyDraft) =>
  draft.foods.some((food) => toFoodItem(food) !== null) ||
  draft.unestimatedMeals.some((meal) => toUnestimatedMeal(meal) !== null) ||
  draft.training.trim().length > 0 ||
  normalizeDraftNumber(draft.weightKg) !== null ||
  normalizeDraftNumber(draft.sleepHours, 24) !== null

export const canConfirmAiDraft = (
  draft: AiDailyDraft | null,
  activeDate: string,
  confirming: boolean,
) =>
  Boolean(
    draft &&
      !confirming &&
      draft.date === activeDate &&
      hasSaveableAiDraft(draft),
  )

export const mergeAiDraft = (
  currentRecord: DailyRecord,
  draft: AiDailyDraft,
  options: AiMergeOptions,
): DailyRecord => {
  const newFoods = draft.foods.flatMap((food) => {
    const normalized = toFoodItem(food)
    return normalized ? [normalized] : []
  })
  const newUnestimatedMeals = draft.unestimatedMeals.flatMap((meal) => {
    const normalized = toUnestimatedMeal(meal)
    return normalized ? [normalized] : []
  })

  const draftWeight = normalizeDraftNumber(draft.weightKg)
  const draftSleep = normalizeDraftNumber(draft.sleepHours, 24)

  const weightKg =
    draftWeight !== null &&
    (currentRecord.weightKg === null || options.replaceWeight)
      ? draftWeight
      : currentRecord.weightKg

  const sleepHours =
    draftSleep !== null &&
    (currentRecord.sleepHours === null || options.replaceSleep)
      ? draftSleep
      : currentRecord.sleepHours

  return {
    ...currentRecord,
    date: currentRecord.date,
    weightKg,
    sleepHours,
    training: mergeTrainingText(currentRecord.training, draft.training),
    foods: [...newFoods, ...currentRecord.foods],
    unestimatedMeals: [
      ...newUnestimatedMeals,
      ...currentRecord.unestimatedMeals,
    ],
  }
}
