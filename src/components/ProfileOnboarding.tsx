import { useEffect, useRef, useState } from 'react'
import { requestProfileDraft } from '../profile/client'
import {
  getNextProfileQuestionId,
  getPreviousProfileQuestionId,
  selectProfileQuestionIds,
} from '../profile/questionEngine'
import {
  removeProfileDraft,
  saveProfileDraft,
} from '../profile/profileStorage'
import type {
  ProfileOnboardingStage,
  ProfileQuestionId,
  StoredProfileDraft,
  UserProfile,
  UserProfileDraft,
} from '../profile/types'
import { PROFILE_TEXT_MAX_LENGTH } from '../profile/types'
import {
  createUserProfile,
  getProfileInputError,
} from '../profile/validation'
import { ProfileDraftReview } from './ProfileDraftReview'
import { ProfileQuestionStep } from './ProfileQuestionStep'

type ProfileOnboardingProps = {
  initialDraft: StoredProfileDraft | null
  existingProfile?: UserProfile | null
  onComplete: (profile: UserProfile) => string | null
  onSkip: (draft: StoredProfileDraft) => void
  onCancelEdit?: () => void
}

type ProfileFlowState = {
  stage: ProfileOnboardingStage
  rawText: string
  parsedDraft: UserProfileDraft | null
  questionIds: ProfileQuestionId[]
  answeredQuestionIds: ProfileQuestionId[]
  skippedQuestionIds: ProfileQuestionId[]
  currentQuestionId: ProfileQuestionId | null
}

const profileToDraft = (profile: UserProfile): UserProfileDraft => ({
  facts: { ...profile.facts },
  estimates: {
    bodyFatPercentRange: profile.estimates.bodyFatPercentRange
      ? {
          ...profile.estimates.bodyFatPercentRange,
          basis: [...profile.estimates.bodyFatPercentRange.basis],
        }
      : null,
  },
  unknowns: [],
})

const toStoredDraft = (flow: ProfileFlowState): StoredProfileDraft => ({
  version: 1,
  stage:
    flow.stage === 'questions' || flow.stage === 'review'
      ? flow.stage
      : 'intro',
  rawText: flow.rawText,
  parsedDraft: flow.parsedDraft,
  questionIds: flow.questionIds,
  answeredQuestionIds: flow.answeredQuestionIds,
  skippedQuestionIds: flow.skippedQuestionIds,
  currentQuestionId: flow.currentQuestionId,
  updatedAt: new Date().toISOString(),
})

export function ProfileOnboarding({
  initialDraft,
  existingProfile = null,
  onComplete,
  onSkip,
  onCancelEdit,
}: ProfileOnboardingProps) {
  const editing = existingProfile !== null
  const [flow, setFlow] = useState<ProfileFlowState>(() => {
    if (existingProfile) {
      return {
        stage: 'review',
        rawText: '',
        parsedDraft: profileToDraft(existingProfile),
        questionIds: [],
        answeredQuestionIds: existingProfile.onboarding.answeredQuestionIds,
        skippedQuestionIds: existingProfile.onboarding.skippedQuestionIds,
        currentQuestionId: null,
      }
    }
    if (initialDraft) {
      return { ...initialDraft, stage: initialDraft.stage }
    }
    return {
      stage: 'intro',
      rawText: '',
      parsedDraft: null,
      questionIds: [],
      answeredQuestionIds: [],
      skippedQuestionIds: [],
      currentQuestionId: null,
    }
  })
  const [error, setError] = useState<string | null>(null)
  const [storageError, setStorageError] = useState<string | null>(null)
  const controllerRef = useRef<AbortController | null>(null)
  const requestIdRef = useRef(0)
  const pendingSaveRef = useRef(false)

  useEffect(() => {
    if (editing || !pendingSaveRef.current || flow.stage === 'parsing') {
      return
    }
    pendingSaveRef.current = false
    const result = saveProfileDraft(toStoredDraft(flow))
    setStorageError(result.error)
  }, [editing, flow])

  useEffect(
    () => () => {
      requestIdRef.current += 1
      controllerRef.current?.abort()
    },
    [],
  )

  const updateFlow = (
    updater: ProfileFlowState | ((current: ProfileFlowState) => ProfileFlowState),
  ) => {
    pendingSaveRef.current = true
    setFlow(updater)
  }

  const submitNaturalText = async () => {
    const inputError = getProfileInputError(flow.rawText)
    if (inputError || flow.stage === 'parsing') {
      setError(inputError)
      return
    }

    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    saveProfileDraft(toStoredDraft({ ...flow, stage: 'intro' }))
    setError(null)
    setFlow((current) => ({ ...current, stage: 'parsing' }))

    try {
      const parsedDraft = await requestProfileDraft(
        flow.rawText.trim(),
        controller.signal,
      )
      if (requestIdRef.current !== requestId) {
        return
      }
      const questionIds = selectProfileQuestionIds(parsedDraft)
      updateFlow((current) => ({
        ...current,
        stage: questionIds.length > 0 ? 'questions' : 'review',
        parsedDraft,
        questionIds,
        answeredQuestionIds: [],
        skippedQuestionIds: [],
        currentQuestionId: questionIds[0] ?? null,
      }))
    } catch (requestError) {
      if (requestIdRef.current !== requestId || controller.signal.aborted) {
        return
      }
      setFlow((current) => ({ ...current, stage: 'intro' }))
      setError(
        requestError instanceof Error
          ? requestError.message
          : '暂时无法整理个人基线，请稍后再试。',
      )
    } finally {
      if (requestIdRef.current === requestId) {
        controllerRef.current = null
      }
    }
  }

  const cancelProfileRequest = () => {
    requestIdRef.current += 1
    controllerRef.current?.abort()
    controllerRef.current = null
    setFlow((current) => ({ ...current, stage: 'intro' }))
    setError(null)
  }

  const moveQuestion = (skipped: boolean) => {
    const currentId = flow.currentQuestionId
    if (!currentId) {
      updateFlow((current) => ({ ...current, stage: 'review' }))
      return
    }
    const nextId = getNextProfileQuestionId(flow.questionIds, currentId)
    updateFlow((current) => ({
      ...current,
      stage: nextId ? 'questions' : 'review',
      currentQuestionId: nextId,
      answeredQuestionIds: skipped
        ? current.answeredQuestionIds
        : [...new Set([...current.answeredQuestionIds, currentId])],
      skippedQuestionIds: skipped
        ? [...new Set([...current.skippedQuestionIds, currentId])]
        : current.skippedQuestionIds.filter((id) => id !== currentId),
    }))
  }

  const goBackFromQuestion = () => {
    const previousId = getPreviousProfileQuestionId(
      flow.questionIds,
      flow.currentQuestionId,
    )
    updateFlow((current) => ({
      ...current,
      stage: previousId ? 'questions' : 'intro',
      currentQuestionId: previousId,
    }))
  }

  const confirmProfile = () => {
    if (!flow.parsedDraft) {
      return
    }
    const profile = createUserProfile(
      flow.parsedDraft,
      flow.answeredQuestionIds,
      flow.skippedQuestionIds,
      existingProfile,
    )
    const saveError = onComplete(profile)
    if (saveError) {
      setError(saveError)
      return
    }
    removeProfileDraft()
    setFlow((current) => ({ ...current, stage: 'completed' }))
  }

  const currentIndex = flow.currentQuestionId
    ? flow.questionIds.indexOf(flow.currentQuestionId)
    : -1

  return (
    <section className="panel profile-onboarding" aria-labelledby="profile-title">
      {(flow.stage === 'intro' || flow.stage === 'parsing') && (
        <div className="profile-intro">
          <div className="section-heading">
            <span className="eyebrow">Profile / Baseline</span>
            <h2 id="profile-title">先让我了解你</h2>
            <p className="section-description">
              不用按格式填写。说说你的年龄、身高体重、运动习惯，以及你最想改变什么。
            </p>
          </div>
          <label className="profile-natural-input">
            <span>个人身体描述</span>
            <textarea
              rows={7}
              maxLength={PROFILE_TEXT_MAX_LENGTH}
              disabled={flow.stage === 'parsing'}
              value={flow.rawText}
              placeholder="例如：我20岁，172厘米，78公斤，一周练三四次，平时久坐，最近主要想减脂……"
              onChange={(event) => {
                setError(null)
                updateFlow((current) => ({
                  ...current,
                  rawText: event.target.value,
                }))
              }}
            />
          </label>
          <div className="profile-input-meta">
            <p>
              这段文字会发送给 DeepSeek 用于整理。确认后的个人档案只保存在当前浏览器，EasyFitness 不建立服务端个人档案。
            </p>
            <span>{flow.rawText.length} / {PROFILE_TEXT_MAX_LENGTH}</span>
          </div>
          <div className="profile-intro-actions">
            <button
              type="button"
              className="primary-button"
              disabled={flow.stage === 'parsing' || Boolean(getProfileInputError(flow.rawText))}
              onClick={submitNaturalText}
            >
              {flow.stage === 'parsing'
                ? '正在整理你的信息……'
                : '帮我建立基线'}
            </button>
            {flow.stage === 'parsing' ? (
              <button
                type="button"
                className="secondary-button"
                onClick={cancelProfileRequest}
              >
                取消整理
              </button>
            ) : !editing && (
              <button
                type="button"
                className="course-text-button"
                onClick={() => onSkip(toStoredDraft(flow))}
              >
                暂时跳过，先进入应用
              </button>
            )}
          </div>
        </div>
      )}

      {flow.stage === 'questions' &&
        flow.parsedDraft &&
        flow.currentQuestionId && (
          <ProfileQuestionStep
            key={flow.currentQuestionId}
            questionId={flow.currentQuestionId}
            index={Math.max(0, currentIndex)}
            total={flow.questionIds.length}
            draft={flow.parsedDraft}
            answered={flow.answeredQuestionIds.includes(flow.currentQuestionId)}
            onChange={(parsedDraft) =>
              updateFlow((current) => ({ ...current, parsedDraft }))
            }
            onBack={goBackFromQuestion}
            onSkip={() => moveQuestion(true)}
            onContinue={() => moveQuestion(false)}
          />
        )}

      {flow.stage === 'review' && flow.parsedDraft && (
        <ProfileDraftReview
          draft={flow.parsedDraft}
          editing={editing}
          onChange={(parsedDraft) =>
            updateFlow((current) => ({ ...current, parsedDraft }))
          }
          onBack={() =>
            updateFlow((current) => ({
              ...current,
              stage: current.questionIds.length > 0 ? 'questions' : 'intro',
              currentQuestionId: current.questionIds.at(-1) ?? null,
            }))
          }
          onConfirm={confirmProfile}
          onCancelEdit={onCancelEdit}
        />
      )}

      <div className="ai-status-region" aria-live="polite" aria-atomic="true">
        {flow.stage === 'parsing' && (
          <p role="status" className="sr-only">正在整理你的信息……</p>
        )}
        {error && <p className="ai-inline-error" role="alert">{error}</p>}
        {storageError && (
          <p className="ai-inline-error" role="alert">{storageError}</p>
        )}
      </div>
    </section>
  )
}
