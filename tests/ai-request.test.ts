import assert from 'node:assert/strict'
import test from 'node:test'
import { DEEPSEEK_SYSTEM_PROMPT } from '../api/_lib/deepseekPrompt.ts'
import { AI_TEXT_MAX_LENGTH } from '../src/ai/types.ts'
import {
  canSubmitNaturalLog,
  getNaturalLogInputError,
} from '../src/ai/validation.ts'

const date = '2026-07-17'

test('empty natural-language input cannot be submitted', () => {
  assert.match(getNaturalLogInputError('  ', date) ?? '', /先写下/)
  assert.equal(canSubmitNaturalLog(' ', date, false), false)
})

test('overlong natural-language input cannot be submitted', () => {
  assert.match(getNaturalLogInputError('a'.repeat(AI_TEXT_MAX_LENGTH + 1), date) ?? '', /4000/)
})

test('invalid dates and an in-flight request disable submission', () => {
  assert.equal(canSubmitNaturalLog('今天跑步了', '2026-02-30', false), false)
  assert.equal(canSubmitNaturalLog('今天跑步了', date, true), false)
})

test('valid text and date can be submitted while idle', () => {
  assert.equal(canSubmitNaturalLog('今天跑步了', date, false), true)
})

test('AI prompt separates restaurant context and spending from actual foods', () => {
  assert.match(DEEPSEEK_SYSTEM_PROMPT, /餐厅名、品牌名/)
  assert.match(DEEPSEEK_SYSTEM_PROMPT, /消费金额.*不能用于推断热量或蛋白质/)
  assert.match(DEEPSEEK_SYSTEM_PROMPT, /unestimatedMeals/)
  assert.match(DEEPSEEK_SYSTEM_PROMPT, /海底捞/)
})
