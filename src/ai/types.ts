export const AI_TEXT_MAX_LENGTH = 4000
export const AI_REQUEST_MAX_BYTES = 16 * 1024
export const AI_MAX_FOODS = 30
export const AI_FOOD_NAME_MAX_LENGTH = 100
export const AI_AMOUNT_MAX_LENGTH = 100
export const AI_MAX_UNESTIMATED_MEALS = 10
export const AI_MEAL_DESCRIPTION_MAX_LENGTH = 240
export const AI_MEAL_REASON_MAX_LENGTH = 200
export const AI_TRAINING_MAX_LENGTH = 1200
export const AI_MAX_UNKNOWNS = 20
export const AI_UNKNOWN_MAX_LENGTH = 200
export const AI_FEEDBACK_MAX_LENGTH = 100

export type AiConfidence = 'high' | 'medium' | 'low'

export type AiEstimateRange = {
  min: number
  max: number
}

export type AiFoodDraft = {
  id: string
  name: string
  amountText: string
  caloriesRange: AiEstimateRange | null
  proteinRange: AiEstimateRange | null
  calories: number | null
  protein: number | null
  confidence: AiConfidence
}

export type AiUnestimatedMealDraft = {
  id: string
  description: string
  reason: string
}

export type AiDailyDraft = {
  date: string
  weightKg: number | null
  sleepHours: number | null
  training: string
  foods: AiFoodDraft[]
  unestimatedMeals: AiUnestimatedMealDraft[]
  unknowns: string[]
  feedback: string
}

export type AiMergeOptions = {
  replaceWeight: boolean
  replaceSleep: boolean
}

export type AiApiErrorCode =
  | 'INVALID_REQUEST'
  | 'METHOD_NOT_ALLOWED'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'AI_DISABLED'
  | 'AI_NOT_CONFIGURED'
  | 'AI_TIMEOUT'
  | 'AI_RATE_LIMITED'
  | 'AI_UPSTREAM_ERROR'
  | 'AI_INVALID_RESPONSE'
  | 'AI_CONTENT_REJECTED'

export type AiApiErrorBody = {
  error: string
  code: AiApiErrorCode
}
