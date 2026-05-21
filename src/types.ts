export type DayRating = '加分' | '持平' | '扣分'

export type FoodItem = {
  id: string
  name: string
  calories: number
  protein: number
}

export type DailyRecord = {
  date: string
  weightKg: number | null
  training: string
  sleepHours: number | null
  foods: FoodItem[]
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
  points: string[]
}
