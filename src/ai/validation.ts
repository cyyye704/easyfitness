import type { AiDailyDraft, AiEstimateRange, AiFoodDraft } from './types.js'
import {
  AI_AMOUNT_MAX_LENGTH,
  AI_FEEDBACK_MAX_LENGTH,
  AI_FOOD_NAME_MAX_LENGTH,
  AI_MAX_FOODS,
  AI_MAX_UNKNOWNS,
  AI_TEXT_MAX_LENGTH,
  AI_TRAINING_MAX_LENGTH,
  AI_UNKNOWN_MAX_LENGTH,
} from './types.js'
import { isDateKey, roundToOneDecimal } from '../utils.js'

export type DeepSeekResponseErrorKind =
  | 'missing_choices'
  | 'length'
  | 'content_filter'
  | 'insufficient_system_resource'
  | 'unexpected_finish_reason'
  | 'empty_content'
  | 'invalid_json'
  | 'invalid_structure'

export class AiValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AiValidationError'
  }
}

export class DeepSeekResponseError extends Error {
  kind: DeepSeekResponseErrorKind

  constructor(kind: DeepSeekResponseErrorKind, message: string) {
    super(message)
    this.name = 'DeepSeekResponseError'
    this.kind = kind
  }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const isConfidence = (value: unknown): value is AiFoodDraft['confidence'] =>
  value === 'high' || value === 'medium' || value === 'low'

const truncate = (value: string, maximum: number) => value.trim().slice(0, maximum)

const normalizeNullableScalar = (
  value: unknown,
  fieldName: string,
  maximum = Number.POSITIVE_INFINITY,
) => {
  if (value === null) {
    return null
  }

  if (typeof value !== 'number') {
    throw new AiValidationError(`${fieldName} has an invalid type`)
  }

  return Number.isFinite(value) && value >= 0 && value <= maximum ? value : null
}

export const normalizeEstimateRange = (value: unknown): AiEstimateRange | null => {
  if (!isObject(value)) {
    return null
  }

  const { min, max } = value
  if (
    typeof min !== 'number' ||
    typeof max !== 'number' ||
    !Number.isFinite(min) ||
    !Number.isFinite(max) ||
    min < 0 ||
    max < 0
  ) {
    return null
  }

  return min <= max ? { min, max } : { min: max, max: min }
}

export const createAiDraftId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }

  return `ai-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

const normalizeModelFood = (value: unknown): AiFoodDraft | null => {
  if (!isObject(value)) {
    return null
  }

  if (
    typeof value.name !== 'string' ||
    typeof value.amountText !== 'string' ||
    !isConfidence(value.confidence) ||
    !('caloriesRange' in value) ||
    !('proteinRange' in value)
  ) {
    return null
  }

  const name = truncate(value.name, AI_FOOD_NAME_MAX_LENGTH)
  if (!name) {
    return null
  }

  const caloriesRange = normalizeEstimateRange(value.caloriesRange)
  const proteinRange = normalizeEstimateRange(value.proteinRange)

  return {
    id: createAiDraftId(),
    name,
    amountText: truncate(value.amountText, AI_AMOUNT_MAX_LENGTH),
    caloriesRange,
    proteinRange,
    calories: caloriesRange
      ? Math.round((caloriesRange.min + caloriesRange.max) / 2)
      : null,
    protein: proteinRange
      ? roundToOneDecimal((proteinRange.min + proteinRange.max) / 2)
      : null,
    confidence: value.confidence,
  }
}

export const normalizeModelDraft = (
  value: unknown,
  targetDate: string,
): AiDailyDraft => {
  if (!isDateKey(targetDate)) {
    throw new AiValidationError('Target date is invalid')
  }

  if (!isObject(value)) {
    throw new AiValidationError('AI draft root must be an object')
  }

  if (
    !Array.isArray(value.foods) ||
    !Array.isArray(value.unknowns) ||
    typeof value.training !== 'string' ||
    typeof value.feedback !== 'string' ||
    !('weightKg' in value) ||
    !('sleepHours' in value)
  ) {
    throw new AiValidationError('AI draft core fields are incomplete')
  }

  const weightKg = normalizeNullableScalar(value.weightKg, 'weightKg')
  const sleepHours = normalizeNullableScalar(value.sleepHours, 'sleepHours', 24)
  let ignoredFood = false
  const foods = value.foods.slice(0, AI_MAX_FOODS).flatMap((food) => {
    const normalized = normalizeModelFood(food)
    if (!normalized) {
      ignoredFood = true
      return []
    }
    return [normalized]
  })

  const unknowns = value.unknowns
    .filter((item): item is string => typeof item === 'string')
    .map((item) => truncate(item, AI_UNKNOWN_MAX_LENGTH))
    .filter(Boolean)
    .slice(0, AI_MAX_UNKNOWNS)

  if (ignoredFood && unknowns.length < AI_MAX_UNKNOWNS) {
    unknowns.push('One malformed food item was ignored.')
  }

  return {
    date: targetDate,
    weightKg,
    sleepHours,
    training: truncate(value.training, AI_TRAINING_MAX_LENGTH),
    foods,
    unknowns,
    feedback: truncate(value.feedback, AI_FEEDBACK_MAX_LENGTH),
  }
}

export const parseDeepSeekCompletion = (
  payload: unknown,
  targetDate: string,
): AiDailyDraft => {
  if (!isObject(payload) || !Array.isArray(payload.choices) || !payload.choices[0]) {
    throw new DeepSeekResponseError('missing_choices', 'Missing choices')
  }

  const choice = payload.choices[0]
  if (!isObject(choice)) {
    throw new DeepSeekResponseError('missing_choices', 'Invalid choice')
  }

  const finishReason = choice.finish_reason
  if (finishReason === 'length') {
    throw new DeepSeekResponseError('length', 'Output was truncated')
  }
  if (finishReason === 'content_filter') {
    throw new DeepSeekResponseError('content_filter', 'Content was filtered')
  }
  if (finishReason === 'insufficient_system_resource') {
    throw new DeepSeekResponseError(
      'insufficient_system_resource',
      'Upstream resource unavailable',
    )
  }
  if (finishReason !== 'stop') {
    throw new DeepSeekResponseError(
      'unexpected_finish_reason',
      'Unexpected finish reason',
    )
  }

  if (!isObject(choice.message) || typeof choice.message.content !== 'string') {
    throw new DeepSeekResponseError('empty_content', 'Missing content')
  }

  const content = choice.message.content.trim()
  if (!content) {
    throw new DeepSeekResponseError('empty_content', 'Empty content')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new DeepSeekResponseError('invalid_json', 'Content is not valid JSON')
  }

  try {
    return normalizeModelDraft(parsed, targetDate)
  } catch (error) {
    if (error instanceof AiValidationError) {
      throw new DeepSeekResponseError('invalid_structure', error.message)
    }
    throw error
  }
}

const normalizeApiFood = (value: unknown): AiFoodDraft | null => {
  if (!isObject(value) || typeof value.id !== 'string') {
    return null
  }

  const normalized = normalizeModelFood(value)
  if (!normalized) {
    return null
  }

  const normalizeSuggestedValue = (candidate: unknown) =>
    candidate === null
      ? null
      : typeof candidate === 'number' &&
          Number.isFinite(candidate) &&
          candidate >= 0
        ? candidate
        : null

  return {
    ...normalized,
    id: value.id.slice(0, 120) || createAiDraftId(),
    calories: normalizeSuggestedValue(value.calories),
    protein: normalizeSuggestedValue(value.protein),
  }
}

export const parseAiDraftApiResponse = (
  value: unknown,
  expectedDate: string,
): AiDailyDraft => {
  if (!isObject(value) || !isObject(value.draft)) {
    throw new AiValidationError('Service draft has an invalid shape')
  }

  const draft = value.draft
  if (draft.date !== expectedDate || !isDateKey(expectedDate)) {
    throw new AiValidationError('Service draft date does not match')
  }

  if (
    !Array.isArray(draft.foods) ||
    !Array.isArray(draft.unknowns) ||
    typeof draft.training !== 'string' ||
    typeof draft.feedback !== 'string' ||
    !('weightKg' in draft) ||
    !('sleepHours' in draft)
  ) {
    throw new AiValidationError('Service draft fields are incomplete')
  }

  return {
    date: expectedDate,
    weightKg: normalizeNullableScalar(draft.weightKg, 'weightKg'),
    sleepHours: normalizeNullableScalar(draft.sleepHours, 'sleepHours', 24),
    training: truncate(draft.training, AI_TRAINING_MAX_LENGTH),
    foods: draft.foods.slice(0, AI_MAX_FOODS).flatMap((food) => {
      const normalized = normalizeApiFood(food)
      return normalized ? [normalized] : []
    }),
    unknowns: draft.unknowns
      .filter((item): item is string => typeof item === 'string')
      .map((item) => truncate(item, AI_UNKNOWN_MAX_LENGTH))
      .filter(Boolean)
      .slice(0, AI_MAX_UNKNOWNS),
    feedback: truncate(draft.feedback, AI_FEEDBACK_MAX_LENGTH),
  }
}

export const getNaturalLogInputError = (text: string, targetDate: string) => {
  const normalized = text.trim()
  if (!normalized) {
    return '请先写下今天的饮食、训练或睡眠情况。'
  }
  if (normalized.length > AI_TEXT_MAX_LENGTH) {
    return `内容不能超过 ${AI_TEXT_MAX_LENGTH} 个字符。`
  }
  if (!isDateKey(targetDate)) {
    return '记录日期不合法，请重新选择日期。'
  }
  return null
}

export const canSubmitNaturalLog = (
  text: string,
  targetDate: string,
  loading: boolean,
) => !loading && getNaturalLogInputError(text, targetDate) === null
