import { useState } from 'react'
import { canConfirmAiDraft } from '../ai/mergeAiDraft'
import type {
  AiConfidence,
  AiDailyDraft,
  AiFoodDraft,
  AiMergeOptions,
  AiUnestimatedMealDraft,
} from '../ai/types'
import { createAiDraftId } from '../ai/validation'
import type { DailyRecord } from '../types'

type AiDraftReviewProps = {
  draft: AiDailyDraft
  activeDate: string
  currentRecord: DailyRecord
  confirming: boolean
  onChange: (draft: AiDailyDraft) => void
  onCancel: () => void
  onConfirm: (options: AiMergeOptions) => void
}

const confidenceLabels: Record<AiConfidence, string> = {
  high: '高',
  medium: '中',
  low: '低',
}

const numberOrNull = (value: string) => {
  if (!value.trim()) {
    return null
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

const formatRange = (range: AiFoodDraft['caloriesRange'], unit: string) =>
  range ? `${range.min}–${range.max} ${unit}` : '无法估算'

const emptyFood = (): AiFoodDraft => ({
  id: createAiDraftId(),
  name: '',
  amountText: '',
  caloriesRange: null,
  proteinRange: null,
  calories: null,
  protein: null,
  confidence: 'low',
})

const emptyUnestimatedMeal = (): AiUnestimatedMealDraft => ({
  id: createAiDraftId(),
  description: '',
  reason: '',
})

export function AiDraftReview({
  draft,
  activeDate,
  currentRecord,
  confirming,
  onChange,
  onCancel,
  onConfirm,
}: AiDraftReviewProps) {
  const [replaceWeight, setReplaceWeight] = useState(false)
  const [replaceSleep, setReplaceSleep] = useState(false)

  const updateFood = (id: string, patch: Partial<AiFoodDraft>) => {
    onChange({
      ...draft,
      foods: draft.foods.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    })
  }

  const updateUnestimatedMeal = (
    id: string,
    patch: Partial<AiUnestimatedMealDraft>,
  ) => {
    onChange({
      ...draft,
      unestimatedMeals: draft.unestimatedMeals.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    })
  }

  const hasWeightConflict = currentRecord.weightKg !== null && draft.weightKg !== null
  const hasSleepConflict =
    currentRecord.sleepHours !== null && draft.sleepHours !== null
  const canConfirm = canConfirmAiDraft(draft, activeDate, confirming)

  return (
    <div className="ai-draft-review" aria-labelledby="ai-review-title">
      <div className="ai-review-heading">
        <div>
          <span className="eyebrow">Draft / Check before save</span>
          <h3 id="ai-review-title">检查 AI 整理草稿</h3>
        </div>
        <span className="ai-date-chip">{draft.date}</span>
      </div>

      {draft.date !== activeDate && (
        <p className="ai-inline-error" role="alert">
          日期已切换，这份草稿不能保存，请重新整理。
        </p>
      )}

      <div className="ai-scalar-grid">
        <label>
          <span>体重（kg）</span>
          <input
            type="number"
            min="0"
            step="0.1"
            value={draft.weightKg ?? ''}
            onChange={(event) =>
              onChange({ ...draft, weightKg: numberOrNull(event.target.value) })
            }
          />
        </label>
        <label>
          <span>睡眠（小时）</span>
          <input
            type="number"
            min="0"
            max="24"
            step="0.1"
            value={draft.sleepHours ?? ''}
            onChange={(event) => {
              const value = numberOrNull(event.target.value)
              onChange({
                ...draft,
                sleepHours: value !== null && value <= 24 ? value : null,
              })
            }}
          />
        </label>
      </div>

      {hasWeightConflict && (
        <fieldset className="ai-conflict-choice">
          <legend>体重已有 {currentRecord.weightKg} kg，如何处理？</legend>
          <label>
            <input
              type="radio"
              name="ai-weight-conflict"
              checked={!replaceWeight}
              onChange={() => setReplaceWeight(false)}
            />
            保留已有体重
          </label>
          <label>
            <input
              type="radio"
              name="ai-weight-conflict"
              checked={replaceWeight}
              onChange={() => setReplaceWeight(true)}
            />
            使用本次识别体重
          </label>
        </fieldset>
      )}

      {hasSleepConflict && (
        <fieldset className="ai-conflict-choice">
          <legend>睡眠已有 {currentRecord.sleepHours} 小时，如何处理？</legend>
          <label>
            <input
              type="radio"
              name="ai-sleep-conflict"
              checked={!replaceSleep}
              onChange={() => setReplaceSleep(false)}
            />
            保留已有睡眠
          </label>
          <label>
            <input
              type="radio"
              name="ai-sleep-conflict"
              checked={replaceSleep}
              onChange={() => setReplaceSleep(true)}
            />
            使用本次识别睡眠
          </label>
        </fieldset>
      )}

      <label className="ai-training-field">
        <span>训练记录</span>
        <textarea
          rows={3}
          value={draft.training}
          onChange={(event) => onChange({ ...draft, training: event.target.value })}
          placeholder="没有识别到训练内容"
        />
      </label>

      <div className="ai-food-heading">
        <div>
          <h4>饮食草稿</h4>
          <p>范围是 AI 的估算依据，最终值可直接修改。</p>
        </div>
        <button
          type="button"
          className="secondary-button"
          onClick={() => onChange({ ...draft, foods: [...draft.foods, emptyFood()] })}
        >
          添加食物
        </button>
      </div>

      <div className="ai-food-drafts">
        {draft.foods.length === 0 && <p className="empty-state">没有识别到食物。</p>}
        {draft.foods.map((item, index) => (
          <article className="ai-food-draft" key={item.id}>
            <div className="ai-food-card-heading">
              <strong>食物 {index + 1}</strong>
              <span className={`confidence-badge confidence-${item.confidence}`}>
                可信度：{confidenceLabels[item.confidence]}
              </span>
            </div>
            <div className="ai-food-fields">
              <label>
                <span>名称</span>
                <input
                  value={item.name}
                  aria-label={`食物 ${index + 1} 名称`}
                  onChange={(event) => updateFood(item.id, { name: event.target.value })}
                />
              </label>
              <label>
                <span>份量</span>
                <input
                  value={item.amountText}
                  aria-label={`食物 ${index + 1} 份量`}
                  onChange={(event) =>
                    updateFood(item.id, { amountText: event.target.value })
                  }
                />
              </label>
              <label>
                <span>最终热量（kcal）</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={item.calories ?? ''}
                  aria-label={`食物 ${index + 1} 最终热量`}
                  onChange={(event) =>
                    updateFood(item.id, { calories: numberOrNull(event.target.value) })
                  }
                />
                <small>估算：{formatRange(item.caloriesRange, 'kcal')}</small>
              </label>
              <label>
                <span>最终蛋白质（g）</span>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={item.protein ?? ''}
                  aria-label={`食物 ${index + 1} 最终蛋白质`}
                  onChange={(event) =>
                    updateFood(item.id, { protein: numberOrNull(event.target.value) })
                  }
                />
                <small>估算：{formatRange(item.proteinRange, 'g')}</small>
              </label>
            </div>
            <button
              type="button"
              className="danger-button"
              aria-label={`删除食物 ${index + 1}`}
              onClick={() =>
                onChange({
                  ...draft,
                  foods: draft.foods.filter((foodItem) => foodItem.id !== item.id),
                })
              }
            >
              删除
            </button>
          </article>
        ))}
      </div>

      <div className="ai-food-heading ai-unestimated-heading">
        <div>
          <h4>未估算饮食</h4>
          <p>会保存为饮食事实，但不计入热量和蛋白质汇总。</p>
        </div>
        <button
          type="button"
          className="secondary-button"
          onClick={() =>
            onChange({
              ...draft,
              unestimatedMeals: [
                ...draft.unestimatedMeals,
                emptyUnestimatedMeal(),
              ],
            })
          }
        >
          添加未估算记录
        </button>
      </div>

      <div className="ai-food-drafts">
        {draft.unestimatedMeals.length === 0 && (
          <p className="empty-state">没有未估算的饮食事件。</p>
        )}
        {draft.unestimatedMeals.map((item, index) => (
          <article className="ai-food-draft ai-unestimated-draft" key={item.id}>
            <div className="ai-food-card-heading">
              <strong>未估算记录 {index + 1}</strong>
              <span className="unestimated-badge">不参与汇总</span>
            </div>
            <div className="ai-food-fields">
              <label>
                <span>饮食事实</span>
                <input
                  value={item.description}
                  aria-label={`未估算记录 ${index + 1} 饮食事实`}
                  placeholder="例如：在海底捞吃了一顿，消费约 500 元"
                  onChange={(event) =>
                    updateUnestimatedMeal(item.id, {
                      description: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                <span>未估算原因</span>
                <input
                  value={item.reason}
                  aria-label={`未估算记录 ${index + 1} 原因`}
                  placeholder="例如：未说明菜品和实际食用量"
                  onChange={(event) =>
                    updateUnestimatedMeal(item.id, { reason: event.target.value })
                  }
                />
              </label>
            </div>
            <button
              type="button"
              className="danger-button"
              aria-label={`删除未估算记录 ${index + 1}`}
              onClick={() =>
                onChange({
                  ...draft,
                  unestimatedMeals: draft.unestimatedMeals.filter(
                    (meal) => meal.id !== item.id,
                  ),
                })
              }
            >
              删除
            </button>
          </article>
        ))}
      </div>

      {draft.unknowns.length > 0 && (
        <div className="ai-unknowns">
          <strong>以下信息无法可靠确认</strong>
          <ul>
            {draft.unknowns.map((item, index) => (
              <li key={`${item}-${index}`}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {draft.feedback && <p className="ai-feedback">{draft.feedback}</p>}

      <div className="ai-review-actions">
        <button type="button" className="secondary-button" onClick={onCancel}>
          取消
        </button>
        <button
          type="button"
          className="primary-button"
          disabled={!canConfirm}
          onClick={() => onConfirm({ replaceWeight, replaceSleep })}
        >
          {confirming ? '正在添加…' : '确认添加'}
        </button>
      </div>
    </div>
  )
}
