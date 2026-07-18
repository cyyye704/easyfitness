import { useState } from 'react'
import {
  activityLabels,
  confidenceLabels,
  experienceLabels,
  goalLabels,
  sexLabels,
} from '../profile/labels'
import type {
  ActivityLevel,
  EnergyEstimateSex,
  PrimaryGoal,
  ProfileConfidence,
  TrainingExperience,
  UserProfileDraft,
} from '../profile/types'
import { hasProfileDraftContent } from '../profile/validation'

type ProfileDraftReviewProps = {
  draft: UserProfileDraft
  editing: boolean
  onChange: (draft: UserProfileDraft) => void
  onBack: () => void
  onConfirm: () => void
  onCancelEdit?: () => void
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
  const number = Number(value)
  return Number.isFinite(number) &&
    number >= minimum &&
    number <= maximum &&
    (!integer || Number.isInteger(number))
    ? number
    : null
}

type NumericInputKey =
  | 'age'
  | 'heightCm'
  | 'baselineWeightKg'
  | 'waistCm'
  | 'strengthSessionsPerWeek'
  | 'cardioSessionsPerWeek'
  | 'averageSleepHours'
  | 'bodyFatMin'
  | 'bodyFatMax'

export function ProfileDraftReview({
  draft,
  editing,
  onChange,
  onBack,
  onConfirm,
  onCancelEdit,
}: ProfileDraftReviewProps) {
  const [numericInputs, setNumericInputs] = useState<Record<NumericInputKey, string>>({
    age: draft.facts.age?.toString() ?? '',
    heightCm: draft.facts.heightCm?.toString() ?? '',
    baselineWeightKg: draft.facts.baselineWeightKg?.toString() ?? '',
    waistCm: draft.facts.waistCm?.toString() ?? '',
    strengthSessionsPerWeek:
      draft.facts.strengthSessionsPerWeek?.toString() ?? '',
    cardioSessionsPerWeek: draft.facts.cardioSessionsPerWeek?.toString() ?? '',
    averageSleepHours: draft.facts.averageSleepHours?.toString() ?? '',
    bodyFatMin: draft.estimates.bodyFatPercentRange?.min.toString() ?? '',
    bodyFatMax: draft.estimates.bodyFatPercentRange?.max.toString() ?? '',
  })
  const [listInputs, setListInputs] = useState({
    healthLimitations: draft.facts.healthLimitations.join('\n'),
    dietaryPreferences: draft.facts.dietaryPreferences.join('\n'),
    bodyFatBasis: draft.estimates.bodyFatPercentRange?.basis.join('\n') ?? '',
  })
  const updateFacts = (patch: Partial<UserProfileDraft['facts']>) =>
    onChange({ ...draft, facts: { ...draft.facts, ...patch } })
  const estimate = draft.estimates.bodyFatPercentRange

  const updateNumericFact = (
    key: Exclude<NumericInputKey, 'bodyFatMin' | 'bodyFatMax'>,
    value: string,
    minimum: number,
    maximum: number,
    integer = false,
  ) => {
    setNumericInputs((current) => ({ ...current, [key]: value }))
    updateFacts({ [key]: numberOrNull(value, minimum, maximum, integer) })
  }

  const updateEstimate = (
    patch: Partial<NonNullable<UserProfileDraft['estimates']['bodyFatPercentRange']>>,
  ) => {
    const current = estimate ?? {
      min: 1,
      max: 1,
      confidence: 'low' as const,
      basis: ['用户在复核时手动补充'],
    }
    onChange({
      ...draft,
      estimates: { bodyFatPercentRange: { ...current, ...patch } },
    })
  }

  const updateEstimateNumber = (
    key: 'bodyFatMin' | 'bodyFatMax',
    value: string,
  ) => {
    setNumericInputs((current) => ({ ...current, [key]: value }))
    const parsed = numberOrNull(value, 1, 70)
    if (parsed !== null) {
      updateEstimate(key === 'bodyFatMin' ? { min: parsed } : { max: parsed })
    }
  }

  const invalidNumericFields = [
    numericInputs.age.trim() && numberOrNull(numericInputs.age, 13, 120, true) === null,
    numericInputs.heightCm.trim() &&
      numberOrNull(numericInputs.heightCm, 100, 250) === null,
    numericInputs.baselineWeightKg.trim() &&
      numberOrNull(numericInputs.baselineWeightKg, 25, 400) === null,
    numericInputs.waistCm.trim() &&
      numberOrNull(numericInputs.waistCm, 30, 250) === null,
    numericInputs.strengthSessionsPerWeek.trim() &&
      numberOrNull(numericInputs.strengthSessionsPerWeek, 0, 14, true) === null,
    numericInputs.cardioSessionsPerWeek.trim() &&
      numberOrNull(numericInputs.cardioSessionsPerWeek, 0, 14, true) === null,
    numericInputs.averageSleepHours.trim() &&
      numberOrNull(numericInputs.averageSleepHours, 0, 24) === null,
    estimate && numberOrNull(numericInputs.bodyFatMin, 1, 70) === null,
    estimate && numberOrNull(numericInputs.bodyFatMax, 1, 70) === null,
  ]
  const hasInvalidNumericInput = invalidNumericFields.some(Boolean)

  return (
    <div className="profile-review" aria-labelledby="profile-review-title">
      <div className="section-heading">
        <span className="eyebrow">Profile / Review</span>
        <h2 id="profile-review-title">
          {editing ? '查看与修改个人基线' : '检查个人基线草稿'}
        </h2>
        <p className="section-description">
          这里只保存你确认过的事实。AI 估计会单独标注，不会伪装成测量结果。
        </p>
      </div>

      <div className="profile-review-grid">
        <label>
          <span>年龄</span>
          <input
            type="number"
            min="13"
            max="120"
            step="1"
            inputMode="numeric"
            aria-invalid={
              Boolean(numericInputs.age.trim()) &&
              numberOrNull(numericInputs.age, 13, 120, true) === null
            }
            value={numericInputs.age}
            onChange={(event) =>
              updateNumericFact('age', event.target.value, 13, 120, true)
            }
          />
        </label>
        <label>
          <span>能量估算参数</span>
          <select
            value={draft.facts.sexForEnergyEstimate}
            onChange={(event) =>
              updateFacts({
                sexForEnergyEstimate: event.target.value as EnergyEstimateSex,
              })
            }
          >
            {Object.entries(sexLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <small>只用于未来能量估算，不是身份标签；第一版不生成能量目标。</small>
        </label>
        <label>
          <span>身高（cm）</span>
          <input
            type="number"
            min="100"
            max="250"
            step="0.1"
            inputMode="decimal"
            aria-invalid={
              Boolean(numericInputs.heightCm.trim()) &&
              numberOrNull(numericInputs.heightCm, 100, 250) === null
            }
            value={numericInputs.heightCm}
            onChange={(event) =>
              updateNumericFact('heightCm', event.target.value, 100, 250)
            }
          />
        </label>
        <label>
          <span>初始基线体重（kg）</span>
          <input
            type="number"
            min="25"
            max="400"
            step="0.1"
            inputMode="decimal"
            aria-invalid={
              Boolean(numericInputs.baselineWeightKg.trim()) &&
              numberOrNull(numericInputs.baselineWeightKg, 25, 400) === null
            }
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
        </label>
        <label>
          <span>腰围（cm）</span>
          <input
            type="number"
            min="30"
            max="250"
            step="0.1"
            inputMode="decimal"
            aria-invalid={
              Boolean(numericInputs.waistCm.trim()) &&
              numberOrNull(numericInputs.waistCm, 30, 250) === null
            }
            value={numericInputs.waistCm}
            onChange={(event) =>
              updateNumericFact('waistCm', event.target.value, 30, 250)
            }
          />
        </label>
        <label>
          <span>主要目标</span>
          <select
            value={draft.facts.primaryGoal}
            onChange={(event) =>
              updateFacts({ primaryGoal: event.target.value as PrimaryGoal })
            }
          >
            {Object.entries(goalLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label>
          <span>日常活动水平</span>
          <select
            value={draft.facts.activityLevel}
            onChange={(event) =>
              updateFacts({ activityLevel: event.target.value as ActivityLevel })
            }
          >
            {Object.entries(activityLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label>
          <span>训练经验</span>
          <select
            value={draft.facts.trainingExperience}
            onChange={(event) =>
              updateFacts({
                trainingExperience: event.target.value as TrainingExperience,
              })
            }
          >
            {Object.entries(experienceLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
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
        <label>
          <span>平均睡眠（小时）</span>
          <input
            type="number"
            min="0"
            max="24"
            step="0.5"
            inputMode="decimal"
            aria-invalid={
              Boolean(numericInputs.averageSleepHours.trim()) &&
              numberOrNull(numericInputs.averageSleepHours, 0, 24) === null
            }
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
        </label>
      </div>

      <div className="profile-review-text-grid">
        <label>
          <span>健康限制</span>
          <textarea
            rows={3}
            value={listInputs.healthLimitations}
            placeholder="每行一条；没有可以留空"
            onChange={(event) => {
              setListInputs((current) => ({
                ...current,
                healthLimitations: event.target.value,
              }))
              updateFacts({
                healthLimitations: event.target.value
                  .split('\n')
                  .map((item) => item.trim())
                  .filter(Boolean),
              })
            }}
          />
        </label>
        <label>
          <span>饮食偏好</span>
          <textarea
            rows={3}
            value={listInputs.dietaryPreferences}
            placeholder="每行一条；例如不吃牛肉"
            onChange={(event) => {
              setListInputs((current) => ({
                ...current,
                dietaryPreferences: event.target.value,
              }))
              updateFacts({
                dietaryPreferences: event.target.value
                  .split('\n')
                  .map((item) => item.trim())
                  .filter(Boolean),
              })
            }}
          />
        </label>
        <label className="profile-notes-field">
          <span>其他备注</span>
          <textarea
            rows={3}
            maxLength={500}
            value={draft.facts.notes}
            onChange={(event) => updateFacts({ notes: event.target.value })}
          />
        </label>
      </div>

      <section className="profile-estimate-editor" aria-labelledby="body-fat-title">
        <div className="profile-estimate-heading">
          <div>
            <h3 id="body-fat-title">体脂估计</h3>
            <p>仅在用户明确提供相关信息时保留；它不是测量值。</p>
          </div>
          {estimate ? (
            <button
              type="button"
              className="danger-button"
              onClick={() => {
                setNumericInputs((current) => ({
                  ...current,
                  bodyFatMin: '',
                  bodyFatMax: '',
                }))
                setListInputs((current) => ({ ...current, bodyFatBasis: '' }))
                onChange({
                  ...draft,
                  estimates: { bodyFatPercentRange: null },
                })
              }}
            >
              删除估计
            </button>
          ) : (
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                setNumericInputs((current) => ({
                  ...current,
                  bodyFatMin: '1',
                  bodyFatMax: '1',
                }))
                setListInputs((current) => ({
                  ...current,
                  bodyFatBasis: '用户在复核时手动补充',
                }))
                updateEstimate({})
              }}
            >
              手动添加估计
            </button>
          )}
        </div>
        {estimate && (
          <div className="profile-estimate-grid">
            <label>
              <span>最低估计（%）</span>
              <input
                type="number"
                min="1"
                max="70"
                step="0.1"
                inputMode="decimal"
                aria-invalid={numberOrNull(numericInputs.bodyFatMin, 1, 70) === null}
                value={numericInputs.bodyFatMin}
                onChange={(event) => updateEstimateNumber('bodyFatMin', event.target.value)}
              />
            </label>
            <label>
              <span>最高估计（%）</span>
              <input
                type="number"
                min="1"
                max="70"
                step="0.1"
                inputMode="decimal"
                aria-invalid={numberOrNull(numericInputs.bodyFatMax, 1, 70) === null}
                value={numericInputs.bodyFatMax}
                onChange={(event) => updateEstimateNumber('bodyFatMax', event.target.value)}
              />
            </label>
            <label>
              <span>置信度</span>
              <select
                value={estimate.confidence}
                onChange={(event) =>
                  updateEstimate({ confidence: event.target.value as ProfileConfidence })
                }
              >
                {Object.entries(confidenceLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label className="profile-estimate-basis">
              <span>估计依据</span>
              <textarea
                rows={2}
                value={listInputs.bodyFatBasis}
                onChange={(event) => {
                  setListInputs((current) => ({
                    ...current,
                    bodyFatBasis: event.target.value,
                  }))
                  updateEstimate({
                    basis: event.target.value
                      .split('\n')
                      .map((item) => item.trim())
                      .filter(Boolean),
                  })
                }}
              />
            </label>
          </div>
        )}
      </section>

      {(draft.facts.heightCm === null || draft.facts.baselineWeightKg === null) && (
        <p className="profile-incomplete-note">
          已经可以保存这份基础档案。补充身高或体重后，身体模型会更完整。
        </p>
      )}

      {draft.unknowns.length > 0 && (
        <div className="profile-unknowns">
          <strong>仍未补充的信息</strong>
          <ul>
            {draft.unknowns.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      )}

      {hasInvalidNumericInput && (
        <p className="profile-field-error" role="alert">
          请修正超出范围或格式不正确的数字后再保存。
        </p>
      )}

      <div className="profile-review-actions">
        {editing && onCancelEdit ? (
          <button type="button" className="secondary-button" onClick={onCancelEdit}>
            取消修改
          </button>
        ) : (
          <button type="button" className="secondary-button" onClick={onBack}>
            返回修改
          </button>
        )}
        <button
          type="button"
          className="primary-button"
          disabled={!hasProfileDraftContent(draft) || hasInvalidNumericInput}
          onClick={onConfirm}
        >
          {editing ? '保存个人基线' : '确认建立个人基线'}
        </button>
      </div>
    </div>
  )
}
