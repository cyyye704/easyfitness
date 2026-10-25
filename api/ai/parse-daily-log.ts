import { createAiHandler } from '../_lib/aiHandler.js'
import { parseDailyLogWithDeepSeek } from '../_lib/deepseek.js'
import { parseDailyLogRequest } from '../_lib/http.js'

export default {
  fetch: createAiHandler({
    disabledMessage: 'AI 自然语言记录功能当前未启用。',
    parse: parseDailyLogRequest,
    execute: async ({ text, targetDate }, signal) => {
      const result = await parseDailyLogWithDeepSeek(text, targetDate, signal)
      return { body: { draft: result.draft }, retried: result.retried }
    },
  }),
}
