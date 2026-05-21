import type { DailyRecord } from '../types'

type TodayFormProps = {
  record: DailyRecord
  onChange: (record: DailyRecord) => void
}

const parseNumber = (value: string) => {
  if (value === '') {
    return null
  }

  return Number(value)
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
                sleepHours: parseNumber(event.target.value),
              })
            }
          />
        </label>
      </div>

      <label className="stacked-field">
        <span>训练</span>
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
