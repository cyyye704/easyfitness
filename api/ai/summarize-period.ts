import { createAiHandler } from '../_lib/aiHandler.js'
import { generatePeriodSummaryWithDeepSeek } from '../_lib/periodSummary.js'
import { parsePeriodSummaryRequest } from '../_lib/periodSummaryHttp.js'

export default {
  fetch: createAiHandler({
    feature: 'period_summary',
    disabledMessage: 'AI 阶段总结功能当前未启用。',
    parse: parsePeriodSummaryRequest,
    execute: async (metrics, signal) => {
      const result = await generatePeriodSummaryWithDeepSeek(metrics, signal)
      return { body: { summary: result.summary }, retried: result.retried }
    },
  }),
}
