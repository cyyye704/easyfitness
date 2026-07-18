export const PROFILE_TEXT_MAX_LENGTH = 4000
export const PROFILE_MAX_QUESTIONS = 5

export type EnergyEstimateSex = 'male' | 'female' | 'unspecified'

export type PrimaryGoal =
  | 'fat-loss'
  | 'muscle-gain'
  | 'maintenance'
  | 'fitness'
  | 'unsure'

export type ActivityLevel =
  | 'sedentary'
  | 'light'
  | 'moderate'
  | 'high'
  | 'unsure'

export type TrainingExperience =
  | 'beginner'
  | 'intermediate'
  | 'advanced'
  | 'unsure'

export type ProfileConfidence = 'high' | 'medium' | 'low'

export type BodyFatEstimate = {
  min: number
  max: number
  confidence: ProfileConfidence
  basis: string[]
}

export type UserProfileFacts = {
  age: number | null
  sexForEnergyEstimate: EnergyEstimateSex
  heightCm: number | null
  baselineWeightKg: number | null
  waistCm: number | null
  primaryGoal: PrimaryGoal
  activityLevel: ActivityLevel
  trainingExperience: TrainingExperience
  strengthSessionsPerWeek: number | null
  cardioSessionsPerWeek: number | null
  averageSleepHours: number | null
  healthLimitations: string[]
  dietaryPreferences: string[]
  notes: string
}

export type UserProfileEstimates = {
  bodyFatPercentRange: BodyFatEstimate | null
}

export type UserProfileDraft = {
  facts: UserProfileFacts
  estimates: UserProfileEstimates
  unknowns: string[]
}

export type ProfileQuestionId =
  | 'age'
  | 'sexForEnergyEstimate'
  | 'heightCm'
  | 'baselineWeightKg'
  | 'primaryGoal'
  | 'activityLevel'
  | 'trainingFrequency'
  | 'averageSleepHours'
  | 'healthLimitations'

export type ProfileQuestionInputType =
  | 'number'
  | 'single-select'
  | 'compound-number'
  | 'text'

export type ProfileQuestion = {
  id: ProfileQuestionId
  priority: number
  requiredForUsableModel: boolean
  title: string
  description?: string
  inputType: ProfileQuestionInputType
  shouldAsk: (draft: UserProfileDraft) => boolean
}

export type ProfileOnboardingStage =
  | 'intro'
  | 'parsing'
  | 'questions'
  | 'review'
  | 'completed'

export type StoredProfileDraft = {
  version: 1
  stage: 'intro' | 'questions' | 'review'
  rawText: string
  parsedDraft: UserProfileDraft | null
  questionIds: ProfileQuestionId[]
  answeredQuestionIds: ProfileQuestionId[]
  skippedQuestionIds: ProfileQuestionId[]
  currentQuestionId: ProfileQuestionId | null
  updatedAt: string
}

export type UserProfile = {
  version: 1
  id: string
  createdAt: string
  updatedAt: string
  facts: UserProfileFacts
  estimates: UserProfileEstimates
  onboarding: {
    completed: true
    completedAt: string
    answeredQuestionIds: ProfileQuestionId[]
    skippedQuestionIds: ProfileQuestionId[]
    source: 'natural-language'
  }
}

export type BodyModelLevel = 'insufficient' | 'basic' | 'usable' | 'enhanced'

export type BodyModel = {
  asOfDate: string
  currentWeightKg: number | null
  currentWeightSource: 'latest-daily-record' | 'profile-baseline' | 'missing'
  heightCm: number | null
  bmi: number | null
  primaryGoal: PrimaryGoal
  bodyFatPercentRange: BodyFatEstimate | null
  level: BodyModelLevel
  missingImportantFields: string[]
  cautions: string[]
}

export type ProfileApiResponse = {
  draft: UserProfileDraft
}
