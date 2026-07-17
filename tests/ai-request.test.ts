import assert from 'node:assert/strict'
import test from 'node:test'
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
