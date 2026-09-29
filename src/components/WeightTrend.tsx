import { useId } from 'react'
import type { DailyRecord } from '../types'
import { calculateWeightTrend } from '../periodSummary/weightTrend'

type Props = { records: Record<string, DailyRecord>; startDate: string; endDate: string }

export function WeightTrend({ records, startDate, endDate }: Props) {
  const titleId = useId()
  const descriptionId = useId()
  const points = calculateWeightTrend(records, startDate, endDate)
  const values = points.flatMap((point) => [point.weightKg, point.averageKg].filter((value): value is number => value !== null))
  const readingCount = points.filter((point) => point.weightKg !== null).length
  const last = points.at(-1)
  const min = values.length ? Math.max(0, Math.min(...values) - 0.5) : 0
  const max = values.length ? Math.max(...values) + 0.5 : 1
  const x = (index: number) => points.length === 1 ? 218 : 48 + index / (points.length - 1) * 340
  const y = (value: number) => 170 - (value - min) / (max - min) * 144
  const path = (field: 'weightKg' | 'averageKg') => points.map((point, index) => {
    const value = point[field]
    if (value === null) return ''
    return `${index === 0 || points[index - 1][field] === null ? 'M' : 'L'} ${x(index)} ${y(value)}`
  }).join(' ')

  return (
    <section className="weight-trend" aria-labelledby={titleId}>
      <div className="weight-trend-heading"><h3 id={titleId}>体重趋势</h3><span>周期内 {readingCount} 次记录</span></div>
      <p className="food-help" id={descriptionId}>灰色实点为原始体重，红线为空心点标记的 7 天平均值。每个均值取当天及前 6 个自然日的实际记录，缺失日期不补零；窗口可包含周期开始前的数据。</p>
      {values.length ? <>
        <svg viewBox="0 0 410 208" role="img" aria-labelledby={`${titleId} ${descriptionId}`}>
          {[min, (min + max) / 2, max].map((value) => <g key={value}>
            <line className="trend-grid" x1="48" x2="388" y1={y(value)} y2={y(value)} />
            <text className="trend-label" x="40" y={y(value) + 4} textAnchor="end">{value.toFixed(1)}</text>
          </g>)}
          <text className="trend-label" x="8" y="13">kg</text>
          <path className="trend-raw" d={path('weightKg')} />
          <path className="trend-average" d={path('averageKg')} />
          {points.map((point, index) => <g key={point.date}>
            {point.weightKg !== null && <circle className="trend-raw-dot" cx={x(index)} cy={y(point.weightKg)} r="3">
              <title>{point.date}：{point.weightKg} kg</title>
            </circle>}
            {point.averageKg !== null && <circle className="trend-average-dot" cx={x(index)} cy={y(point.averageKg)} r="2.5">
              <title>{point.date}：7 天平均 {point.averageKg} kg，{point.sampleCount} 次记录</title>
            </circle>}
          </g>)}
          <text className="trend-label" x="48" y="195">{startDate.slice(5)}</text>
          <text className="trend-label" x="388" y="195" textAnchor="end">{endDate.slice(5)}</text>
        </svg>
        <p className="trend-current">截至 {endDate} 的 7 天平均：<strong>{last?.averageKg === null ? '暂无数据' : `${last?.averageKg} kg`}</strong> · {last?.sampleCount ?? 0}/7 天有记录</p>
        {readingCount < 2 && <p className="food-help">周期内体重少于 2 次，暂不足以判断变化。</p>}
        <details className="weight-data"><summary>查看每日数值与样本数</summary><div className="weight-table-wrap">
          <table><thead><tr><th>日期</th><th>体重 kg</th><th>7 天均值 kg</th><th>窗口样本</th></tr></thead>
            <tbody>{points.map((point) => <tr key={point.date}><td>{point.date}</td><td>{point.weightKg ?? '—'}</td>
              <td>{point.averageKg ?? '—'}</td><td>{point.sampleCount}/7</td></tr>)}</tbody></table>
        </div></details>
      </> : <p className="empty-state">当前周期及其前 6 天暂无有效体重记录，填写体重后即可查看。</p>}
    </section>
  )
}
