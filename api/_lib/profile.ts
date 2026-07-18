import type { UserProfileDraft } from '../../src/profile/types.js'
import { parseDeepSeekProfileCompletion } from '../../src/profile/validation.js'
import { requestDeepSeekJson } from './deepseek.js'
import { buildProfileUserPrompt, PROFILE_SYSTEM_PROMPT } from './profilePrompt.js'

export const parseProfileWithDeepSeek = async (
  text: string,
  requestSignal: AbortSignal,
): Promise<{ draft: UserProfileDraft; retried: boolean }> => {
  const result = await requestDeepSeekJson({
    systemPrompt: PROFILE_SYSTEM_PROMPT,
    userPrompt: buildProfileUserPrompt(text),
    requestSignal,
    maxTokens: 1800,
    parsePayload: parseDeepSeekProfileCompletion,
  })
  return { draft: result.value, retried: result.retried }
}
