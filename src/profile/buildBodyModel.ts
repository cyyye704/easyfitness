import type { DailyRecord } from '../types.js'
import { getTodayKey, isDateKey, roundToOneDecimal } from '../utils.js'
import type { BodyModel, UserProfile } from './types.js'

export const getCurrentWeight = (
  profile: UserProfile,
  records: Record<string, DailyRecord>,
) => {
  const latest = Object.values(records)
    .filter(
      (record) =>
        isDateKey(record.date) &&
        typeof record.weightKg === 'number' &&
        Number.isFinite(record.weightKg),
    )
    .sort((first, second) => second.date.localeCompare(first.date))[0]

  if (latest?.weightKg !== null && latest?.weightKg !== undefined) {
    return {
      weightKg: latest.weightKg,
      source: 'latest-daily-record' as const,
    }
  }
  if (profile.facts.baselineWeightKg !== null) {
    return {
      weightKg: profile.facts.baselineWeightKg,
      source: 'profile-baseline' as const,
    }
  }
  return { weightKg: null, source: 'missing' as const }
}

const hasTrainingFrequency = (profile: UserProfile) =>
  profile.facts.strengthSessionsPerWeek !== null ||
  profile.facts.cardioSessionsPerWeek !== null

const hasExplicitHealthAnswer = (profile: UserProfile) =>
  profile.facts.healthLimitations.length > 0 ||
  profile.onboarding.answeredQuestionIds.includes('healthLimitations')

const hasSafetySensitiveText = (profile: UserProfile) => {
  const combined = [
    ...profile.facts.healthLimitations,
    profile.facts.notes,
  ].join(' ')
  return /慢性|治疗|妊娠|怀孕|进食障碍|严重|伤病|断食|催吐|泻药|惩罚性/.test(
    combined,
  )
}

export const buildBodyModel = (
  profile: UserProfile,
  records: Record<string, DailyRecord>,
): BodyModel => {
  const currentWeight = getCurrentWeight(profile, records)
  const heightCm = profile.facts.heightCm
  const bmi =
    currentWeight.weightKg === null || heightCm === null
      ? null
      : roundToOneDecimal(currentWeight.weightKg / (heightCm / 100) ** 2)

  const coreMissing = [
    heightCm === null ? '身高' : null,
    currentWeight.weightKg === null ? '当前体重' : null,
    profile.facts.primaryGoal === 'unsure' ? '主要目标' : null,
  ].filter((item): item is string => item !== null)

  const usableMissing = [
    profile.facts.age === null ? '年龄' : null,
    profile.facts.activityLevel === 'unsure' ? '日常活动水平' : null,
  ].filter((item): item is string => item !== null)

  const enhancedSignals = [
    hasTrainingFrequency(profile),
    profile.facts.averageSleepHours !== null,
    hasExplicitHealthAnswer(profile),
  ].filter(Boolean).length

  let level: BodyModel['level'] = 'insufficient'
  if (coreMissing.length === 0) {
    level = 'basic'
    if (usableMissing.length === 0) {
      level = enhancedSignals >= 2 ? 'enhanced' : 'usable'
    }
  }

  const missingImportantFields = [...coreMissing, ...usableMissing]
  if (!hasTrainingFrequency(profile)) {
    missingImportantFields.push('训练频率')
  }
  if (profile.facts.averageSleepHours === null) {
    missingImportantFields.push('平均睡眠')
  }

  const cautions = hasSafetySensitiveText(profile)
    ? [
        '当前档案包含需要特别注意的健康限制。',
        'EasyFitness 只提供记录和一般性参考，不替代专业医疗建议。',
      ]
    : []

  return {
    asOfDate: getTodayKey(),
    currentWeightKg: currentWeight.weightKg,
    currentWeightSource: currentWeight.source,
    heightCm,
    bmi,
    primaryGoal: profile.facts.primaryGoal,
    bodyFatPercentRange: profile.estimates.bodyFatPercentRange,
    level,
    missingImportantFields: [...new Set(missingImportantFields)],
    cautions,
  }
}
