import { useState } from 'react'
import { corosAlreadyRecorded, createCorosChoices, formatCorosSleep } from '../coros/import'
import type { CorosImportChoice, CorosPreview } from '../coros/types'
import type { DailyRecord } from '../types'

type Props = {
  preview: CorosPreview
  records: Record<string, DailyRecord>
  disabled: boolean
  onConfirm: (choices: Record<string, CorosImportChoice>) => void
  onCancel: () => void
}

export function CorosDraftReview({ preview, records, disabled, onConfirm, onCancel }: Props) {
  const [choices, setChoices] = useState(() => createCorosChoices(preview.days, records))
  const selectedCount = Object.values(choices).filter((choice) => choice.selected).length
  const change = (date: string, patch: Partial<CorosImportChoice>) =>
    setChoices((current) => ({ ...current, [date]: { ...current[date], ...patch } }))

  return <div className="coros-review">
    <h3>复核 COROS 数据</h3>
    <p className="food-help">日期跟随 COROS 账号，睡眠归属醒来当天并包含小睡。活动热量不含静息代谢。本次未返回的指标保留已有值。</p>
    {preview.warnings.length > 0 && <ul className="coros-warnings" aria-label="读取提示">
      {preview.warnings.map((warning, index) => <li key={index}>{warning}</li>)}
    </ul>}
    {preview.days.length === 0 ? <p role="status">最近 7 天没有可导入的数据。请先把手表数据同步到 COROS 手机应用，再重新读取。</p> :
      <div className="coros-days">
        {preview.days.map((day) => {
          const choice = choices[day.sourceDate]
          const record = records[day.sourceDate]
          const same = corosAlreadyRecorded(record, day)
          return <div className="coros-day" key={day.sourceDate}>
            <label className="coros-check coros-date">
              <input type="checkbox" checked={choice.selected} disabled={disabled || same}
                onChange={(event) => change(day.sourceDate, { selected: event.target.checked })} />
              <strong>{day.sourceDate}</strong>
              <span>{same ? '与已记录数据一致' : record?.coros ? '选择以更新设备数据' : '导入这一天'}</span>
            </label>
            <dl className="coros-metrics">
              <div><dt>COROS 睡眠</dt><dd>{formatCorosSleep(day.sleepHours)}</dd></div>
              <div><dt>活动热量</dt><dd>{day.activeCaloriesKcal === null ? '未返回' : `${day.activeCaloriesKcal} kcal`}</dd></div>
            </dl>
            {record?.coros && !same && <p className="food-help">
              已存设备值：睡眠 {formatCorosSleep(record.coros.sleepHours)}，活动热量 {record.coros.activeCaloriesKcal ?? '未返回'}{record.coros.activeCaloriesKcal === null ? '' : ' kcal'}。
            </p>}
            {day.sleepHours !== null && !same && <label className="coros-check">
              <input type="checkbox" checked={choice.useSleep} disabled={disabled || !choice.selected}
                onChange={(event) => change(day.sourceDate, { useSleep: event.target.checked })} />
              <span>{record?.sleepHours == null ? '同时填写当天睡眠时长' : `用 COROS 睡眠替换当前 ${formatCorosSleep(record.sleepHours)}`}</span>
            </label>}
          </div>
        })}
      </div>}
    <p className="food-help">仅勾选的日期会保存到当前 EasyFitness 账号。未勾选“填写／替换睡眠”时，保留当前睡眠时长，同时保留设备来源值供核对。</p>
    <div className="coros-actions">
      <button type="button" className="secondary-button" disabled={disabled} onClick={onCancel}>取消预览</button>
      <button type="button" className="primary-button" disabled={disabled || selectedCount === 0}
        onClick={() => onConfirm(choices)}>确认记录 {selectedCount} 天</button>
    </div>
  </div>
}
