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

  if (!question) {
    return null
  }

  const updateFacts = (patch: Partial<UserProfileDraft['facts']>) =>
    onChange({ ...draft, facts: { ...draft.facts, ...patch } })

  const canContinue = (() => {
    switch (questionId) {
      case 'heightCm':
        return draft.facts.heightCm !== null
      case 'baselineWeightKg':
        return draft.facts.baselineWeightKg !== null
      case 'age':
        return draft.facts.age !== null
      case 'primaryGoal':
        return draft.facts.primaryGoal !== 'unsure'
      case 'activityLevel':
        return draft.facts.activityLevel !== 'unsure'
      case 'sexForEnergyEstimate':
        return true
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
          aria-pressed={selected === value}
          onClick={() => onSelect(value)}
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
              value={draft.facts.heightCm ?? ''}
              onChange={(event) =>
                updateFacts({
                  heightCm: numberOrNull(event.target.value, 100, 250),
                })
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
              value={draft.facts.baselineWeightKg ?? ''}
              onChange={(event) =>
                updateFacts({
                  baselineWeightKg: numberOrNull(event.target.value, 25, 400),
                })
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
              value={draft.facts.age ?? ''}
              onChange={(event) =>
                updateFacts({ age: numberOrNull(event.target.value, 13, 120, true) })
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
              value={draft.facts.strengthSessionsPerWeek ?? ''}
              onChange={(event) =>
                updateFacts({
                  strengthSessionsPerWeek: numberOrNull(
                    event.target.value,
                    0,
                    14,
                  ),
                })
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
              value={draft.facts.cardioSessionsPerWeek ?? ''}
              onChange={(event) =>
                updateFacts({
                  cardioSessionsPerWeek: numberOrNull(event.target.value, 0, 14),
                })
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
              value={draft.facts.averageSleepHours ?? ''}
              onChange={(event) =>
                updateFacts({
                  averageSleepHours: numberOrNull(event.target.value, 0, 24),
                })
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
                value={draft.facts.healthLimitations.join('\n')}
                placeholder="例如：右膝旧伤，深蹲时需要控制负荷"
                onChange={(event) =>
                  updateFacts({
                    healthLimitations: event.target.value
                      .split('\n')
                      .map((item) => item.trim())
                      .filter(Boolean),
                  })
                }
              />
            </label>
          )}
        </div>
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
