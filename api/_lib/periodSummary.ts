import type { PeriodAiSummary, PeriodSummaryMetrics } from '../../src/periodSummary/types.js'
import { parseDeepSeekPeriodSummaryCompletion } from '../../src/periodSummary/validation.js'
import { requestDeepSeekJson } from './deepseek.js'
import {
  buildPeriodSummaryUserPrompt,
  PERIOD_SUMMARY_SYSTEM_PROMPT,
} from './periodSummaryPrompt.js'

export const generatePeriodSummaryWithDeepSeek = async (
  metrics: PeriodSummaryMetrics,
  requestSignal: AbortSignal,
): Promise<{ summary: PeriodAiSummary; retried: boolean }> => {
  const result = await requestDeepSeekJson({
    systemPrompt: PERIOD_SUMMARY_SYSTEM_PROMPT,
    userPrompt: buildPeriodSummaryUserPrompt(metrics),
    requestSignal,
    maxTokens: 1200,
    parsePayload: parseDeepSeekPeriodSummaryCompletion,
  })

  return { summary: result.value, retried: result.retried }
}
