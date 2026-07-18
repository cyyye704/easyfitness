import { useState } from 'react'
import {
  activityLabels,
  goalLabels,
  sexLabels,
} from '../profile/labels'
import { getProfileQuestion } from '../profile/questions'
import type {
  ActivityLevel,
  EnergyEstimateSex,
  PrimaryGoal,
  ProfileQuestionId,
  UserProfileDraft,
} from '../profile/types'

type ProfileQuestionStepProps = {
  questionId: ProfileQuestionId
  index: number
  total: number
  draft: UserProfileDraft
  answered: boolean
  onChange: (draft: UserProfileDraft) => void
  onBack: () => void
  onSkip: () => void
  onContinue: () => void
}

const numberOrNull = (
  value: string,
  minimum: number,
  maximum: number,
  integer = false,
) => {
  if (!value.trim()) {
    return null
  }
  const parsed = Number(value)
  if (
    !Number.isFinite(parsed) ||
    parsed < minimum ||
    parsed > maximum ||
    (integer && !Number.isInteger(parsed))
  ) {
    return null
  }
  return parsed
}

type NumericInputKey =
  | 'heightCm'
  | 'baselineWeightKg'
  | 'age'
  | 'strengthSessionsPerWeek'
  | 'cardioSessionsPerWeek'
  | 'averageSleepHours'

export function ProfileQuestionStep({
  questionId,
  index,
  total,
  draft,
  answered,
  onChange,
  onBack,
  onSkip,
  onContinue,
}: ProfileQuestionStepProps) {
  const question = getProfileQuestion(questionId)
  const [healthChoice, setHealthChoice] = useState<'none' | 'has' | 'unsure' | ''>(
    draft.facts.healthLimitations.length > 0 ? 'has' : answered ? 'none' : '',
  )
  const [healthLimitationsText, setHealthLimitationsText] = useState(
    draft.facts.healthLimitations.join('\n'),
  )
  const [hasSelectedOption, setHasSelectedOption] = useState(() => {
    if (answered) {
      return true
    }
    if (questionId === 'primaryGoal') {
      return draft.facts.primaryGoal !== 'unsure'
    }
    if (questionId === 'activityLevel') {
      return draft.facts.activityLevel !== 'unsure'
    }
    if (questionId === 'sexForEnergyEstimate') {
      return draft.facts.sexForEnergyEstimate !== 'unspecified'
    }
    return false
  })
  const [numericInputs, setNumericInputs] = useState<Record<NumericInputKey, string>>({
    heightCm: draft.facts.heightCm?.toString() ?? '',
    baselineWeightKg: draft.facts.baselineWeightKg?.toString() ?? '',
    age: draft.facts.age?.toString() ?? '',
    strengthSessionsPerWeek:
      draft.facts.strengthSessionsPerWeek?.toString() ?? '',
    cardioSessionsPerWeek: draft.facts.cardioSessionsPerWeek?.toString() ?? '',
    averageSleepHours: draft.facts.averageSleepHours?.toString() ?? '',
  })

  if (!question) {
    return null
  }

  const updateFacts = (patch: Partial<UserProfileDraft['facts']>) =>
    onChange({ ...draft, facts: { ...draft.facts, ...patch } })

  const updateNumericFact = (
    key: NumericInputKey,
    value: string,
    minimum: number,
    maximum: number,
    integer = false,
  ) => {
    setNumericInputs((current) => ({ ...current, [key]: value }))
    updateFacts({ [key]: numberOrNull(value, minimum, maximum, integer) })
  }

  const numericInputError = (() => {
    const invalidMessage = (
      key: NumericInputKey,
      minimum: number,
      maximum: number,
      integer = false,
    ) =>
      numericInputs[key].trim() &&
      numberOrNull(numericInputs[key], minimum, maximum, integer) === null
        ? `请输入 ${minimum}～${maximum}${integer ? ' 的整数' : ''}。`
        : null

    switch (questionId) {
      case 'heightCm':
        return invalidMessage('heightCm', 100, 250)
      case 'baselineWeightKg':
        return invalidMessage('baselineWeightKg', 25, 400)
      case 'age':
        return invalidMessage('age', 13, 120, true)
      case 'trainingFrequency':
        return (
          invalidMessage('strengthSessionsPerWeek', 0, 14, true) ??
          invalidMessage('cardioSessionsPerWeek', 0, 14, true)
        )
      case 'averageSleepHours':
        return invalidMessage('averageSleepHours', 0, 24)
      default:
        return null
    }
  })()

  const canContinue = (() => {
    switch (questionId) {
      case 'heightCm':
        return draft.facts.heightCm !== null
      case 'baselineWeightKg':
        return draft.facts.baselineWeightKg !== null
      case 'age':
        return draft.facts.age !== null
      case 'primaryGoal':
        return hasSelectedOption
      case 'activityLevel':
        return hasSelectedOption
      case 'sexForEnergyEstimate':
        return hasSelectedOption
      case 'trainingFrequency':
        return (
          draft.facts.strengthSessionsPerWeek !== null ||
          draft.facts.cardioSessionsPerWeek !== null
        )
      case 'averageSleepHours':
        return draft.facts.averageSleepHours !== null
      case 'healthLimitations':
        return (
          healthChoice === 'none' ||
          healthChoice === 'unsure' ||
          (healthChoice === 'has' && draft.facts.healthLimitations.length > 0)
        )
    }
  })()

  const renderSingleSelect = <T extends string>(
    labels: Record<T, string>,
    selected: T,
    onSelect: (value: T) => void,
  ) => (
    <div className="profile-option-grid">
      {(Object.entries(labels) as [T, string][]).map(([value, label]) => (
        <button
          type="button"
          key={value}
          aria-pressed={hasSelectedOption && selected === value}
          onClick={() => {
            setHasSelectedOption(true)
            onSelect(value)
          }}
        >
          {label}
        </button>
      ))}
    </div>
  )

  return (
    <div className="profile-question-step" aria-labelledby="profile-question-title">
      <div className="profile-progress-line">
        <span>补充信息</span>
        <strong>
          {index + 1} / {total}
        </strong>
      </div>
      <progress value={index + 1} max={total} aria-label="个人基线补充进度" />
      <div className="section-heading">
        <h2 id="profile-question-title">{question.title}</h2>
        {question.description && (
          <p className="section-description">{question.description}</p>
        )}
      </div>

      {questionId === 'heightCm' && (
        <label className="profile-unit-input">
          <span>身高</span>
          <div>
            <input
              autoFocus
              type="number"
              min="100"
              max="250"
              step="0.1"
              inputMode="decimal"
              aria-invalid={numericInputError !== null}
              value={numericInputs.heightCm}
              onChange={(event) =>
                updateNumericFact('heightCm', event.target.value, 100, 250)
              }
            />
            <b>cm</b>
          </div>
        </label>
      )}

      {questionId === 'baselineWeightKg' && (
        <label className="profile-unit-input">
          <span>当前体重</span>
          <div>
            <input
              autoFocus
              type="number"
              min="25"
              max="400"
              step="0.1"
              inputMode="decimal"
              aria-invalid={numericInputError !== null}
              value={numericInputs.baselineWeightKg}
              onChange={(event) =>
                updateNumericFact(
                  'baselineWeightKg',
                  event.target.value,
                  25,
                  400,
                )
              }
            />
            <b>kg</b>
          </div>
        </label>
      )}

      {questionId === 'age' && (
        <label className="profile-unit-input">
          <span>年龄</span>
          <div>
            <input
              autoFocus
              type="number"
              min="13"
              max="120"
              step="1"
              inputMode="numeric"
              aria-invalid={numericInputError !== null}
              value={numericInputs.age}
              onChange={(event) =>
                updateNumericFact('age', event.target.value, 13, 120, true)
              }
            />
            <b>岁</b>
          </div>
        </label>
      )}

      {questionId === 'primaryGoal' &&
        renderSingleSelect<PrimaryGoal>(
          goalLabels,
          draft.facts.primaryGoal,
          (primaryGoal) => updateFacts({ primaryGoal }),
        )}

      {questionId === 'activityLevel' &&
        renderSingleSelect<ActivityLevel>(
          activityLabels,
          draft.facts.activityLevel,
          (activityLevel) => updateFacts({ activityLevel }),
        )}

      {questionId === 'sexForEnergyEstimate' &&
        renderSingleSelect<EnergyEstimateSex>(
          sexLabels,
          draft.facts.sexForEnergyEstimate,
          (sexForEnergyEstimate) => updateFacts({ sexForEnergyEstimate }),
        )}

      {questionId === 'trainingFrequency' && (
        <div className="profile-compound-input">
          <label>
            <span>每周力量训练次数</span>
            <input
              type="number"
              min="0"
              max="14"
              step="1"
              inputMode="numeric"
              aria-invalid={
                Boolean(numericInputs.strengthSessionsPerWeek.trim()) &&
                numberOrNull(
                  numericInputs.strengthSessionsPerWeek,
                  0,
                  14,
                  true,
                ) === null
              }
              value={numericInputs.strengthSessionsPerWeek}
              onChange={(event) =>
                updateNumericFact(
                  'strengthSessionsPerWeek',
                  event.target.value,
                  0,
                  14,
                  true,
                )
              }
            />
          </label>
          <label>
            <span>每周有氧训练次数</span>
            <input
              type="number"
              min="0"
              max="14"
              step="1"
              inputMode="numeric"
              aria-invalid={
                Boolean(numericInputs.cardioSessionsPerWeek.trim()) &&
                numberOrNull(
                  numericInputs.cardioSessionsPerWeek,
                  0,
                  14,
                  true,
                ) === null
              }
              value={numericInputs.cardioSessionsPerWeek}
              onChange={(event) =>
                updateNumericFact(
                  'cardioSessionsPerWeek',
                  event.target.value,
                  0,
                  14,
                  true,
                )
              }
            />
          </label>
        </div>
      )}

      {questionId === 'averageSleepHours' && (
        <label className="profile-unit-input">
          <span>平均睡眠</span>
          <div>
            <input
              autoFocus
              type="number"
              min="0"
              max="24"
              step="0.5"
              inputMode="decimal"
              aria-invalid={numericInputError !== null}
              value={numericInputs.averageSleepHours}
              onChange={(event) =>
                updateNumericFact(
                  'averageSleepHours',
                  event.target.value,
                  0,
                  24,
                )
              }
            />
            <b>小时</b>
          </div>
        </label>
      )}

      {questionId === 'healthLimitations' && (
        <div className="profile-health-question">
          <div className="profile-option-grid">
            {([
              ['none', '没有'],
              ['has', '有，需要补充说明'],
              ['unsure', '不确定'],
            ] as const).map(([value, label]) => (
              <button
                type="button"
                key={value}
                aria-pressed={healthChoice === value}
                onClick={() => {
                  setHealthChoice(value)
                  if (value !== 'has') {
                    setHealthLimitationsText('')
                    updateFacts({ healthLimitations: [] })
                  }
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {healthChoice === 'has' && (
            <label>
              <span>需要注意的一般限制</span>
              <textarea
                rows={3}
                value={healthLimitationsText}
                placeholder="例如：右膝旧伤，深蹲时需要控制负荷"
                onChange={(event) => {
                  setHealthLimitationsText(event.target.value)
                  updateFacts({
                    healthLimitations: event.target.value
                      .split('\n')
                      .map((item) => item.trim())
                      .filter(Boolean),
                  })
                }}
              />
            </label>
          )}
        </div>
      )}

      {numericInputError && (
        <p className="profile-field-error" role="alert">
          {numericInputError}
        </p>
      )}

      <div className="profile-step-actions">
        <button type="button" className="secondary-button" onClick={onBack}>
          上一步
        </button>
        <button type="button" className="course-text-button" onClick={onSkip}>
          跳过
        </button>
        <button
          type="button"
          className="primary-button"
          disabled={!canContinue}
          onClick={onContinue}
        >
          {index === total - 1 ? '检查我的信息' : '继续'}
        </button>
      </div>
    </div>
  )
}
