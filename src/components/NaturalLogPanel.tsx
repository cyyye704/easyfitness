import { useEffect, useRef, useState } from 'react'
import { requestNaturalLogDraft } from '../ai/client'
import { canConfirmAiDraft, mergeAiDraft } from '../ai/mergeAiDraft'
import { AI_TEXT_MAX_LENGTH } from '../ai/types'
import type { AiDailyDraft, AiMergeOptions } from '../ai/types'
import { canSubmitNaturalLog, getNaturalLogInputError } from '../ai/validation'
import type { DailyRecord } from '../types'
import { AiDraftReview } from './AiDraftReview'

type NaturalLogPanelProps = {
  activeDate: string
  currentRecord: DailyRecord
  onConfirm: (record: DailyRecord) => void
}

export function NaturalLogPanel({
  activeDate,
  currentRecord,
  onConfirm,
}: NaturalLogPanelProps) {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [draft, setDraft] = useState<AiDailyDraft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const controllerRef = useRef<AbortController | null>(null)
  const requestIdRef = useRef(0)
  const previousDateRef = useRef(activeDate)
  const loadingRef = useRef(false)
  const confirmingRef = useRef(false)

  useEffect(() => {
    if (previousDateRef.current === activeDate) {
      return
    }
    previousDateRef.current = activeDate
    requestIdRef.current += 1
    controllerRef.current?.abort()
    controllerRef.current = null
    loadingRef.current = false
    setLoading(false)
    setDraft(null)
    setSuccess(null)
    setError('日期已切换，请重新整理这段内容。')
  }, [activeDate])

  useEffect(
    () => () => {
      requestIdRef.current += 1
      controllerRef.current?.abort()
    },
    [],
  )

  const submit = async () => {
    const inputError = getNaturalLogInputError(text, activeDate)
    if (inputError || loadingRef.current) {
      setError(inputError)
      return
    }

    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    const requestedDate = activeDate

    loadingRef.current = true
    setLoading(true)
    setError(null)
    setSuccess(null)
    setDraft(null)

    try {
      const nextDraft = await requestNaturalLogDraft(
        text.trim(),
        requestedDate,
        controller.signal,
      )
      if (requestIdRef.current !== requestId || activeDate !== requestedDate) {
        return
      }
      setDraft(nextDraft)
    } catch (requestError) {
      if (requestIdRef.current !== requestId || controller.signal.aborted) {
        return
      }
      setError(
        requestError instanceof Error
          ? requestError.message
          : '暂时无法整理这段记录，请稍后再试。',
      )
    } finally {
      if (requestIdRef.current === requestId) {
        loadingRef.current = false
        setLoading(false)
        controllerRef.current = null
      }
    }
  }

  const confirmDraft = (options: AiMergeOptions) => {
    if (
      confirmingRef.current ||
      !canConfirmAiDraft(draft, activeDate, confirming)
    ) {
      return
    }

    confirmingRef.current = true
    setConfirming(true)
    try {
      onConfirm(mergeAiDraft(currentRecord, draft as AiDailyDraft, options))
      setText('')
      setDraft(null)
      setError(null)
      setSuccess('已添加到当天记录，并保存在当前浏览器。')
    } finally {
      confirmingRef.current = false
      setConfirming(false)
    }
  }

  return (
    <section className="panel natural-log-panel" aria-labelledby="natural-log-title">
      <div className="section-heading ai-panel-heading">
        <span className="eyebrow">AI / Natural Log</span>
        <h2 id="natural-log-title">把今天说出来</h2>
        <p className="section-description">
          不用整理格式。说说吃了什么、练了什么、睡得怎么样，剩下的交给 EasyFitness。
        </p>
        <p className="ai-target-date">这段内容将添加到 {activeDate}</p>
      </div>

      <label className="natural-log-input">
        <span>自然语言记录</span>
        <textarea
          rows={5}
          value={text}
          maxLength={AI_TEXT_MAX_LENGTH}
          disabled={loading}
          placeholder="例如：中午食堂吃了半碗米饭和宫保鸡丁，晚上练胸，昨晚睡了七个半小时……"
          onChange={(event) => {
            setText(event.target.value)
            setError(null)
            setSuccess(null)
          }}
        />
      </label>

      <div className="natural-log-meta">
        <p>这段文字会发送给 DeepSeek 用于解析；确认后的正式记录仍只保存在当前浏览器。</p>
        <span aria-label={`已输入 ${text.length} 个字符`}>
          {text.length} / {AI_TEXT_MAX_LENGTH}
        </span>
      </div>

      <button
        type="button"
        className="primary-button natural-log-submit"
        disabled={!canSubmitNaturalLog(text, activeDate, loading)}
        onClick={submit}
      >
        {loading ? '正在整理……' : '帮我整理'}
      </button>

      <div className="ai-status-region" aria-live="polite" aria-atomic="true">
        {loading && <p role="status" className="sr-only">正在整理……</p>}
        {error && (
          <p className="ai-inline-error" role="alert">
            {error}
          </p>
        )}
        {success && <p className="ai-inline-success" role="status">{success}</p>}
      </div>

      {draft && (
        <AiDraftReview
          draft={draft}
          activeDate={activeDate}
          currentRecord={currentRecord}
          confirming={confirming}
          onChange={setDraft}
          onCancel={() => {
            setDraft(null)
            setSuccess(null)
          }}
          onConfirm={confirmDraft}
        />
      )}
    </section>
  )
}
