import type { DailyRecord, FoodItem, NutritionSummary, RatingResult } from './types.js'

export const createEmptyRecord = (date: string): DailyRecord => ({
  date,
  weightKg: null,
  training: '',
  trainingStatus: 'unrecorded',
  nutritionComplete: false,
  sleepHours: null,
  foods: [],
  unestimatedMeals: [],
})

export const isDateKey = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false
  }

  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export const hasRecordContent = (record: DailyRecord) =>
  record.weightKg !== null ||
  record.sleepHours !== null ||
  record.training.trim().length > 0 ||
  record.trainingStatus === 'trained' ||
  record.trainingStatus === 'rest' ||
  record.nutritionComplete === true ||
  record.foods.length > 0 ||
  record.unestimatedMeals.length > 0

export const roundToOneDecimal = (value: number) => Math.round(value * 10) / 10

export const createFoodId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export const createUnestimatedMealId = () => `meal-${createFoodId()}`

export const getTodayKey = () => {
  const now = new Date()
  const timezoneOffset = now.getTimezoneOffset() * 60_000
  return new Date(now.getTime() - timezoneOffset).toISOString().slice(0, 10)
}

export const summarizeNutrition = (foods: FoodItem[]): NutritionSummary => {
  const summary = foods.reduce<NutritionSummary>(
    (summary, food) => ({
      totalCalories: summary.totalCalories + food.calories,
      totalProtein: summary.totalProtein + food.protein,
    }),
    { totalCalories: 0, totalProtein: 0 },
  )

  return {
    totalCalories: Math.round(summary.totalCalories),
    totalProtein: roundToOneDecimal(summary.totalProtein),
  }
}

export const isNutritionComplete = (record: DailyRecord) =>
  record.nutritionComplete === true && record.unestimatedMeals.length === 0

export const evaluateRecord = (record: DailyRecord): RatingResult => {
  const summary = summarizeNutrition(record.foods)
  const reasons: string[] = []
  let score = 0

  if (isNutritionComplete(record)) {
    if (summary.totalCalories >= 1200 && summary.totalCalories <= 2400) {
      score += 1
      reasons.push('已记录热量处于当前通用评分区间')
    } else if (summary.totalCalories > 2800 || summary.totalCalories < 900) {
      score -= 1
      reasons.push('已记录热量超出当前通用评分区间')
    }

    if (summary.totalProtein >= 70) {
      score += 1
      reasons.push('已记录蛋白质达到当前通用评分值')
    } else if (summary.totalProtein < 40) {
      score -= 1
      reasons.push('蛋白质记录偏低')
    }
  }

  if (record.unestimatedMeals.length > 0) {
    reasons.push(
      `有 ${record.unestimatedMeals.length} 条饮食未估算，营养汇总不完整`,
    )
  }

  if (!isNutritionComplete(record) && record.unestimatedMeals.length === 0) {
    reasons.push('饮食尚未确认记完，暂不评价全天摄入')
  }

  if (record.trainingStatus === 'trained') {
    score += 1
    reasons.push('已确认完成训练')
  } else if (record.trainingStatus === 'rest') {
    reasons.push('已记录休息日')
  } else {
    reasons.push('训练状态尚未确认')
  }

  if (record.sleepHours !== null) {
    if (record.sleepHours >= 7) {
      score += 1
      reasons.push('睡眠时长达到恢复需求')
    } else if (record.sleepHours < 6) {
      score -= 1
      reasons.push('睡眠偏短，恢复压力较大')
    }
  }

  if (record.weightKg !== null) {
    reasons.push('已记录体重')
  }

  if (!isNutritionComplete(record) || record.trainingStatus === 'unrecorded' || !record.trainingStatus || record.sleepHours === null) {
    if (record.sleepHours === null) reasons.push('睡眠时长尚未记录')
    return { rating: '待补充', score, reasons }
  }

  if (reasons.length === 0) {
    reasons.push('先完成一条饮食、训练或睡眠记录')
  }

  if (score >= 2) {
    return { rating: '加分', score, reasons }
  }

  if (score <= -1) {
    return { rating: '扣分', score, reasons }
  }

  return { rating: '持平', score, reasons }
}
