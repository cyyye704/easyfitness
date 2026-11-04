import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ProfileDraftReview } from '../src/components/ProfileDraftReview.tsx'
import { ProfileQuestionStep } from '../src/components/ProfileQuestionStep.tsx'
import {
  createEmptyProfileDraft,
  createUserProfile,
  normalizeUserProfile,
  parseDeepSeekProfileCompletion,
} from '../src/profile/validation.ts'
import type { UserProfileDraft } from '../src/profile/types.ts'

const noop = () => {}
const review = (draft: UserProfileDraft) => renderToStaticMarkup(createElement(ProfileDraftReview, {
  draft, editing: false, onChange: noop, onBack: noop, onConfirm: noop,
}))
const question = (draft: UserProfileDraft) => renderToStaticMarkup(createElement(ProfileQuestionStep, {
  questionId: 'trainingFrequency', index: 0, total: 1, draft, answered: false,
  onChange: noop, onBack: noop, onSkip: noop, onContinue: noop,
}))
const primaryButton = (html: string) => html.match(/<button[^>]*class="primary-button"[^>]*>/)?.[0] ?? ''

test('AI training range midpoint remains editable and confirmable without rounding', () => {
  const raw = createEmptyProfileDraft()
  raw.facts.strengthSessionsPerWeek = 3.5
  raw.facts.cardioSessionsPerWeek = 1.5
  raw.facts.notes = '每周力量 3～4 次，有氧 1～2 次'
  const draft = parseDeepSeekProfileCompletion({
    choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(raw) } }],
  })

  for (const html of [question(draft), review(draft)]) {
    const controls = html.match(/<input[^>]*max="14"[^>]*>/g) ?? []
    assert.equal(controls.length, 2)
    for (const control of controls) {
      assert.match(control, /step="any"/)
      assert.match(control, /inputMode="decimal"/)
      assert.match(control, /aria-invalid="false"/)
    }
    assert.match(html, /value="3\.5"/)
    assert.doesNotMatch(html, /role="alert"/)
    assert.ok(primaryButton(html))
    assert.doesNotMatch(primaryButton(html), /disabled/)
  }

  const saved = normalizeUserProfile(createUserProfile(draft, [], []))
  assert.equal(saved.facts.strengthSessionsPerWeek, 3.5)
  assert.equal(saved.facts.cardioSessionsPerWeek, 1.5)
  assert.equal(saved.facts.notes, raw.facts.notes)
})

test('training frequency accepts averages and boundaries but still blocks out-of-range values', () => {
  for (const value of [0, 0.5, 3.25, 14]) {
    const draft = createEmptyProfileDraft()
    draft.facts.strengthSessionsPerWeek = value
    for (const html of [question(draft), review(draft)]) {
      assert.doesNotMatch(primaryButton(html), /disabled/)
    }
  }
  for (const value of [-0.5, 14.5]) {
    const draft = createEmptyProfileDraft()
    draft.facts.strengthSessionsPerWeek = value
    for (const html of [question(draft), review(draft)]) {
      assert.match(primaryButton(html), /disabled/)
      assert.match(html, /role="alert"/)
    }
  }
})

test('fractional training averages do not relax the integer requirement for age', () => {
  const draft = createEmptyProfileDraft()
  draft.facts.age = 20.5
  draft.facts.strengthSessionsPerWeek = 3.5
  const html = review(draft)
  assert.match(primaryButton(html), /disabled/)
  assert.match(html, /role="alert"/)
  assert.match(html, /max="120" step="1"/)
})
