import { useEffect, useMemo, useRef, useState } from 'react'
import { requestPeriodAiSummary } from '../periodSummary/client'
import {
  calculatePeriodSummary,
  getPeriodRangeError,
  shiftDateKey,
} from '../periodSummary/calculatePeriodSummary'
import type { PeriodAiSummary } from '../periodSummary/types'
import type { DailyRecord } from '../types'

type PeriodSummaryPanelProps = {
  records: Record<string, DailyRecord>
  defaultEndDate: string
}

type RangeMode = '7' | '30' | 'custom'

const formatWeightChange = (change: number | null) => {
  if (change === null) {
    return '数据不足'
  }
  if (change === 0) {
    return '0 kg'
  }
  return `${change > 0 ? '+' : ''}${change} kg`
}

export function PeriodSummaryPanel({
  records,
  defaultEndDate,
}: PeriodSummaryPanelProps) {
  const [rangeMode, setRangeMode] = useState<RangeMode>('7')
  const [startDate, setStartDate] = useState(() => shiftDateKey(defaultEndDate, -6))
  const [endDate, setEndDate] = useState(defaultEndDate)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generated, setGenerated] = useState<{
    metricsKey: string
    summary: PeriodAiSummary
  } | null>(null)
  const controllerRef = useRef<AbortController | null>(null)
  const requestIdRef = useRef(0)

  useEffect(
    () => () => {
      requestIdRef.current += 1
      controllerRef.current?.abort()
    },
    [],
  )

  const rangeError = getPeriodRangeError(startDate, endDate)
  const metrics = useMemo(
    () => calculatePeriodSummary(records, startDate, endDate),
    [endDate, records, startDate],
  )
  const metricsKey = metrics ? JSON.stringify(metrics) : ''
  const aiSummary = generated?.metricsKey === metricsKey ? generated.summary : null

  const stopCurrentRequest = () => {
    requestIdRef.current += 1
    controllerRef.current?.abort()
    controllerRef.current = null
    setLoading(false)
    setError(null)
  }

  const selectPreset = (days: 7 | 30) => {
    stopCurrentRequest()
    setRangeMode(String(days) as RangeMode)
    setEndDate(defaultEndDate)
    setStartDate(shiftDateKey(defaultEndDate, -(days - 1)))
  }

  const selectCustom = () => {
    stopCurrentRequest()
    setRangeMode('custom')
  }

  const generateSummary = async () => {
    if (!metrics || metrics.coverage.recordedDays === 0 || loading) {
      return
    }

    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    const requestedMetricsKey = metricsKey

    setLoading(true)
    setError(null)
    try {
      const summary = await requestPeriodAiSummary(metrics, controller.signal)
      if (requestIdRef.current !== requestId) {
        return
      }
      setGenerated({ metricsKey: requestedMetricsKey, summary })
    } catch (requestError) {
      if (requestIdRef.current !== requestId || controller.signal.aborted) {
        return
      }
      setError(
        requestError instanceof Error
          ? requestError.message
          : '暂时无法生成阶段小结，请稍后再试。',
      )
    } finally {
      if (requestIdRef.current === requestId) {
        setLoading(false)
        controllerRef.current = null
      }
    }
  }

  return (
    <section className="panel period-summary-panel" aria-labelledby="period-title">
      <div className="section-heading period-summary-heading">
        <div>
          <span className="eyebrow">Review / Period</span>
          <h2 id="period-title">阶段总结</h2>
          <p className="section-description">
            先由浏览器计算可靠指标，再按需让 AI 整理成一段克制的小结。
          </p>
        </div>
        <div className="period-range-tabs" aria-label="总结周期">
          <button
            type="button"
            aria-pressed={rangeMode === '7'}
            onClick={() => selectPreset(7)}
          >
            最近 7 天
          </button>
          <button
            type="button"
            aria-pressed={rangeMode === '30'}
            onClick={() => selectPreset(30)}
          >
            最近 30 天
          </button>
          <button
            type="button"
            aria-pressed={rangeMode === 'custom'}
            onClick={selectCustom}
          >
            自定义
          </button>
        </div>
      </div>

      {rangeMode === 'custom' && (
        <div className="period-custom-range">
          <label>
            <span>开始日期</span>
            <input
              type="date"
              value={startDate}
              max={endDate || defaultEndDate}
              onChange={(event) => {
                stopCurrentRequest()
                setStartDate(event.target.value)
              }}
            />
          </label>
          <label>
            <span>结束日期</span>
            <input
              type="date"
              value={endDate}
              min={startDate}
              max={defaultEndDate}
              onChange={(event) => {
                stopCurrentRequest()
                setEndDate(event.target.value)
              }}
            />
          </label>
        </div>
      )}

      <div className="period-range-line">
        <span>{startDate}</span>
        <b aria-hidden="true">→</b>
        <span>{endDate}</span>
        {metrics && <small>共 {metrics.range.totalDays} 天</small>}
      </div>

      {rangeError && (
        <p className="ai-inline-error" role="alert">
          {rangeError}
        </p>
      )}

      {metrics && (
        <>
          <div className="period-metric-grid">
            <article>
              <span>记录覆盖</span>
              <strong>
                {metrics.coverage.recordedDays}/{metrics.range.totalDays}
              </strong>
              <small>有内容的日期</small>
            </article>
            <article>
              <span>体重变化</span>
              <strong>{formatWeightChange(metrics.weight.changeKg)}</strong>
              <small>
                {metrics.weight.method === 'three-point-average'
                  ? '前后各 3 次均值'
                  : `${metrics.weight.readingCount} 次记录`}
              </small>
            </article>
            <article>
              <span>训练频率</span>
              <strong>{metrics.training.days} 天</strong>
              <small>存在训练记录</small>
            </article>
            <article>
              <span>平均睡眠</span>
              <strong>
                {metrics.sleep.averageHours === null
                  ? '数据不足'
                  : `${metrics.sleep.averageHours} h`}
              </strong>
              <small>基于 {metrics.sleep.recordedDays} 天</small>
            </article>
          </div>

          <div className="period-nutrition-strip">
            <div>
              <span>已记录部分的平均热量</span>
              <strong>
                {metrics.nutrition.averageCalories === null
                  ? '—'
                  : `${metrics.nutrition.averageCalories} kcal`}
              </strong>
            </div>
            <div>
              <span>已记录部分的平均蛋白质</span>
              <strong>
                {metrics.nutrition.averageProtein === null
                  ? '—'
                  : `${metrics.nutrition.averageProtein} g`}
              </strong>
            </div>
            <div>
              <span>统计依据</span>
              <strong>{metrics.nutrition.recordedDays} 个饮食日期</strong>
            </div>
            <div>
              <span>未估算饮食</span>
              <strong>{metrics.nutrition.unestimatedMealCount} 条</strong>
            </div>
          </div>

          <div className="period-data-notes">
            <strong>数据说明</strong>
            <ul>
              {metrics.limitations.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          <div className="period-ai-block">
            <div className="period-ai-heading">
              <div>
                <span className="eyebrow">AI / Summary</span>
                <h3>阶段小结</h3>
              </div>
              <button
                type="button"
                className="primary-button"
                disabled={loading || metrics.coverage.recordedDays === 0}
                onClick={generateSummary}
              >
                {loading ? '正在生成……' : aiSummary ? '重新生成' : '生成阶段小结'}
              </button>
            </div>
            <p className="period-ai-privacy">
              点击后只发送上方聚合指标，不发送食物名称、原始备注或完整本地记录。
            </p>

            <div className="ai-status-region" aria-live="polite" aria-atomic="true">
              {error && (
                <p className="ai-inline-error" role="alert">
                  {error}
                </p>
              )}
            </div>

            {aiSummary && (
              <article className="period-ai-result">
                <h4>{aiSummary.headline}</h4>
                <ul>
                  {aiSummary.observations.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <div className="period-ai-focus">
                  <span>下一阶段关注点</span>
                  <strong>{aiSummary.focus}</strong>
                </div>
                {aiSummary.limitations.length > 0 && (
                  <p>{aiSummary.limitations.join('；')}</p>
                )}
              </article>
            )}

            {!aiSummary && !loading && !error && (
              <p className="empty-state period-ai-empty">
                本地统计已经完成；需要文字小结时再调用 AI。
              </p>
            )}
          </div>
        </>
      )}
    </section>
  )
}
