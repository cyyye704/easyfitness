export type DayRating = '加分' | '持平' | '扣分'

export type FoodItem = {
  id: string
  name: string
  calories: number
  protein: number
}

export type UnestimatedMeal = {
  id: string
  description: string
  reason: string
}

export type DailyRecord = {
  date: string
  weightKg: number | null
  training: string
  sleepHours: number | null
  foods: FoodItem[]
  unestimatedMeals: UnestimatedMeal[]
}

export type NutritionSummary = {
  totalCalories: number
  totalProtein: number
}

export type RatingResult = {
  rating: DayRating
  score: number
  reasons: string[]
}

export type KnowledgeItem = {
  title: string
  description: string
  cards: KnowledgeCard[]
}

export type KnowledgeCard = {
  title: string
  summary: string
  details: string[]
  takeaway: string
}
