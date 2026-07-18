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

const numberOrNull = (value: string, minimum: number, maximum: number) => {
  if (!value.trim()) {
    return null
  }
  const number = Number(value)
  return Number.isFinite(number) && number >= minimum && number <= maximum
    ? number
    : null
}

export function ProfileDraftReview({
  draft,
  editing,
  onChange,
  onBack,
  onConfirm,
  onCancelEdit,
}: ProfileDraftReviewProps) {
  const updateFacts = (patch: Partial<UserProfileDraft['facts']>) =>
    onChange({ ...draft, facts: { ...draft.facts, ...patch } })
  const estimate = draft.estimates.bodyFatPercentRange

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
            value={draft.facts.age ?? ''}
            onChange={(event) =>
              updateFacts({ age: numberOrNull(event.target.value, 13, 120) })
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
            value={draft.facts.heightCm ?? ''}
            onChange={(event) =>
              updateFacts({ heightCm: numberOrNull(event.target.value, 100, 250) })
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
            value={draft.facts.baselineWeightKg ?? ''}
            onChange={(event) =>
              updateFacts({
                baselineWeightKg: numberOrNull(event.target.value, 25, 400),
              })
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
            value={draft.facts.waistCm ?? ''}
            onChange={(event) =>
              updateFacts({ waistCm: numberOrNull(event.target.value, 30, 250) })
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
            value={draft.facts.strengthSessionsPerWeek ?? ''}
            onChange={(event) =>
              updateFacts({
                strengthSessionsPerWeek: numberOrNull(event.target.value, 0, 14),
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
        <label>
          <span>平均睡眠（小时）</span>
          <input
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
        </label>
      </div>

      <div className="profile-review-text-grid">
        <label>
          <span>健康限制</span>
          <textarea
            rows={3}
            value={draft.facts.healthLimitations.join('\n')}
            placeholder="每行一条；没有可以留空"
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
        <label>
          <span>饮食偏好</span>
          <textarea
            rows={3}
            value={draft.facts.dietaryPreferences.join('\n')}
            placeholder="每行一条；例如不吃牛肉"
            onChange={(event) =>
              updateFacts({
                dietaryPreferences: event.target.value
                  .split('\n')
                  .map((item) => item.trim())
                  .filter(Boolean),
              })
            }
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
              onClick={() =>
                onChange({
                  ...draft,
                  estimates: { bodyFatPercentRange: null },
                })
              }
            >
              删除估计
            </button>
          ) : (
            <button
              type="button"
              className="secondary-button"
              onClick={() => updateEstimate({})}
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
                value={estimate.min}
                onChange={(event) =>
                  updateEstimate({ min: numberOrNull(event.target.value, 1, 70) ?? 1 })
                }
              />
            </label>
            <label>
              <span>最高估计（%）</span>
              <input
                type="number"
                min="1"
                max="70"
                step="0.1"
                value={estimate.max}
                onChange={(event) =>
                  updateEstimate({ max: numberOrNull(event.target.value, 1, 70) ?? 1 })
                }
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
                value={estimate.basis.join('\n')}
                onChange={(event) =>
                  updateEstimate({
                    basis: event.target.value
                      .split('\n')
                      .map((item) => item.trim())
                      .filter(Boolean),
                  })
                }
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
          disabled={!hasProfileDraftContent(draft)}
          onClick={onConfirm}
        >
          {editing ? '保存个人基线' : '确认建立个人基线'}
        </button>
      </div>
    </div>
  )
}
