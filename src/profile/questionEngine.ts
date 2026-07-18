import { profileQuestions } from './questions.js'
import type { ProfileQuestionId, UserProfileDraft } from './types.js'
import { PROFILE_MAX_QUESTIONS } from './types.js'

export const selectProfileQuestionIds = (
  draft: UserProfileDraft,
  answeredQuestionIds: ProfileQuestionId[] = [],
  skippedQuestionIds: ProfileQuestionId[] = [],
) => {
  const excluded = new Set([...answeredQuestionIds, ...skippedQuestionIds])
  return profileQuestions
    .filter(
      (question) => !excluded.has(question.id) && question.shouldAsk(draft),
    )
    .sort((first, second) => first.priority - second.priority)
    .slice(0, PROFILE_MAX_QUESTIONS)
    .map((question) => question.id)
}

export const getNextProfileQuestionId = (
  questionIds: ProfileQuestionId[],
  currentQuestionId: ProfileQuestionId | null,
) => {
  if (questionIds.length === 0) {
    return null
  }
  if (currentQuestionId === null) {
    return questionIds[0]
  }
  const index = questionIds.indexOf(currentQuestionId)
  return index >= 0 ? questionIds[index + 1] ?? null : questionIds[0]
}

export const getPreviousProfileQuestionId = (
  questionIds: ProfileQuestionId[],
  currentQuestionId: ProfileQuestionId | null,
) => {
  if (currentQuestionId === null) {
    return questionIds.at(-1) ?? null
  }
  const index = questionIds.indexOf(currentQuestionId)
  return index > 0 ? questionIds[index - 1] : null
}
