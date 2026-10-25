import { createAiHandler } from '../_lib/aiHandler.js'
import { parseProfileRequest } from '../_lib/http.js'
import { parseProfileWithDeepSeek } from '../_lib/profile.js'

export default {
  fetch: createAiHandler({
    feature: 'profile_parse',
    disabledMessage: 'AI 个人档案功能当前未启用。',
    parse: parseProfileRequest,
    execute: async ({ text }, signal) => {
      const result = await parseProfileWithDeepSeek(text, signal)
      return { body: { draft: result.draft }, retried: result.retried }
    },
  }),
}
