export type WeightTrendMethod = 'insufficient' | 'endpoints' | 'three-point-average'

export type PeriodSummaryMetrics = {
  range: {
    startDate: string
    endDate: string
    totalDays: number
  }
  coverage: {
    recordedDays: number
  }
  weight: {
    readingCount: number
    startKg: number | null
    endKg: number | null
    changeKg: number | null
    method: WeightTrendMethod
  }
  nutrition: {
    recordedDays: number
    averageCalories: number | null
    averageProtein: number | null
    unestimatedMealCount: number
    daysWithUnestimatedMeals: number
  }
  training: {
    days: number
  }
  sleep: {
    recordedDays: number
    averageHours: number | null
    atLeastSevenHoursDays: number
    underSixHoursDays: number
  }
  limitations: string[]
}

export type PeriodAiSummary = {
  headline: string
  observations: string[]
  focus: string
  limitations: string[]
}

export type PeriodSummaryApiResponse = {
  summary: PeriodAiSummary
}
