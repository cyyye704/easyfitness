import type { DailyRecord, TrainingStatus } from '../types'

type TodayFormProps = {
  record: DailyRecord
  onChange: (record: DailyRecord) => void
}

const parseNumber = (value: string, maximum = Number.POSITIVE_INFINITY) => {
  if (value === '') {
    return null
  }

  const number = Number(value)
  if (!Number.isFinite(number)) {
    return null
  }

  return Math.min(maximum, Math.max(0, number))
}

export function TodayForm({ record, onChange }: TodayFormProps) {
  return (
    <section className="panel" aria-labelledby="today-form-title">
      <div className="section-heading">
        <span className="eyebrow">Log</span>
        <h2 id="today-form-title">今日记录</h2>
      </div>

      <div className="field-grid">
        <label>
          <span>体重 kg</span>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.1"
            value={record.weightKg ?? ''}
            onChange={(event) =>
              onChange({
                ...record,
                weightKg: parseNumber(event.target.value),
              })
            }
          />
        </label>

        <label>
          <span>睡眠 h</span>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            max="24"
            step="0.5"
            value={record.sleepHours ?? ''}
            onChange={(event) =>
              onChange({
                ...record,
                sleepHours: parseNumber(event.target.value, 24),
              })
            }
          />
        </label>
      </div>

      <label className="stacked-field">
        <span>训练状态</span>
        <select value={record.trainingStatus} onChange={(event) => onChange({ ...record, trainingStatus: event.target.value as TrainingStatus })}>
          <option value="unrecorded">未记录 / 待确认</option>
          <option value="trained">已训练</option>
          <option value="rest">休息日</option>
        </select>
      </label>
      <label className="stacked-field">
        <span>训练备注</span>
        <textarea
          rows={4}
          value={record.training}
          placeholder="力量训练 45 分钟，步行 8000 步"
          onChange={(event) =>
            onChange({
              ...record,
              training: event.target.value,
            })
          }
        />
      </label>
    </section>
  )
}
