import type { DailyRecord, FoodItem, MealType, UnestimatedMeal } from '../types.ts'
import { createFoodId, roundToOneDecimal } from '../utils.ts'

export const mealLabels: Record<MealType, string> = {
  breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '加餐', unspecified: '未分餐',
}
export const mealTypes = Object.keys(mealLabels) as MealType[]
export const isMealType = (value: unknown): value is MealType =>
  typeof value === 'string' && mealTypes.includes(value as MealType)
export const normalizeMeal = (value: unknown): MealType =>
  isMealType(value) ? value : 'unspecified'

export type FoodValues = Omit<FoodItem, 'id'>
export type FoodTemplate = { id: string; name: string; foods: FoodValues[] }
export type DeletedFood =
  | { kind: 'food'; date: string; item: FoodItem; index: number }
  | { kind: 'unestimated'; date: string; item: UnestimatedMeal; index: number }

export const parseFoodValues = (name: string, calories: string, protein: string, meal: MealType): FoodValues | null => {
  const kcal = Number(calories)
  const grams = Number(protein)
  if (!name.trim() || !calories.trim() || !protein.trim() ||
    !Number.isFinite(kcal) || !Number.isFinite(grams) || kcal < 0 || grams < 0 ||
    kcal > 100_000 || grams > 10_000) return null
  return { name: name.trim(), calories: Math.round(kcal), protein: roundToOneDecimal(grams), meal }
}

export const scaleFoods = (foods: FoodValues[], servings: number, meal: MealType): FoodItem[] => {
  if (!Number.isFinite(servings) || servings <= 0 || servings > 100) return []
  const scaled = foods.map((food) => ({
    ...food, id: createFoodId(), meal,
    name: servings === 1 ? food.name : `${food.name} × ${servings} 份`,
    calories: Math.round(food.calories * servings),
    protein: roundToOneDecimal(food.protein * servings),
  }))
  return scaled.every((food) => parseFoodValues(food.name, String(food.calories), String(food.protein), meal)) ? scaled : []
}

// Return new arrays so React state and the original saved objects stay independent.
// https://react.dev/learn/updating-arrays-in-state
export const appendFoods = (record: DailyRecord, foods: FoodItem[]): DailyRecord =>
  foods.length ? { ...record, foods: [...foods, ...record.foods], nutritionComplete: false } : record

export const restoreDeletedFood = (record: DailyRecord, deleted: DeletedFood): DailyRecord => {
  if (record.date !== deleted.date) return record
  if (deleted.kind === 'food') {
    if (record.foods.some((food) => food.id === deleted.item.id)) return record
    return { ...record, nutritionComplete: false, foods: [
      ...record.foods.slice(0, deleted.index), deleted.item, ...record.foods.slice(deleted.index),
    ] }
  }
  if (record.unestimatedMeals.some((meal) => meal.id === deleted.item.id)) return record
  return { ...record, nutritionComplete: false, unestimatedMeals: [
    ...record.unestimatedMeals.slice(0, deleted.index), deleted.item, ...record.unestimatedMeals.slice(deleted.index),
  ] }
}
