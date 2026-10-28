import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import {
  clearProfileData,
  loadProfile,
  loadProfileDraft,
  PROFILE_DRAFT_STORAGE_KEY,
  PROFILE_STORAGE_KEY,
  removeProfileDraft,
  saveProfile,
  saveProfileDraft,
} from '../src/profile/profileStorage.ts'
import type { StoredProfileDraft } from '../src/profile/types.ts'
import {
  createEmptyProfileDraft,
  createUserProfile,
} from '../src/profile/validation.ts'

const RECORDS_KEY = 'easyfitness.records.v1'
const originalLocalStorage = globalThis.localStorage

class MemoryStorage implements Storage {
  data = new Map<string, string>()
  get length() { return this.data.size }
  clear() { this.data.clear() }
  getItem(key: string) { return this.data.get(key) ?? null }
  key(index: number) { return [...this.data.keys()][index] ?? null }
  removeItem(key: string) { this.data.delete(key) }
  setItem(key: string, value: string) { this.data.set(key, value) }
}

afterEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: originalLocalStorage,
  })
})

const installStorage = () => {
  const storage = new MemoryStorage()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: storage,
  })
  return storage
}

const createDraft = (): StoredProfileDraft => ({
  version: 1,
  stage: 'questions',
  rawText: '想减脂',
  parsedDraft: createEmptyProfileDraft(),
  questionIds: ['heightCm', 'baselineWeightKg'],
  answeredQuestionIds: ['heightCm'],
  skippedQuestionIds: [],
  currentQuestionId: 'baselineWeightKg',
  updatedAt: '2026-07-18T00:00:00.000Z',
})

test('account drafts remain separate from other accounts and the original local draft', () => {
  installStorage()
  assert.equal(saveProfileDraft(createDraft()).ok, true)
  assert.equal(saveProfileDraft({ ...createDraft(), rawText: '账号 A 草稿' }, 'account-a').ok, true)
  assert.equal(loadProfileDraft('account-b').value, null)
  assert.equal(loadProfileDraft('account-a').value?.rawText, '账号 A 草稿')
  assert.equal(loadProfileDraft().value?.rawText, '想减脂')
  assert.equal(removeProfileDraft('account-a').ok, true)
  assert.equal(loadProfileDraft('account-a').value, null)
  assert.equal(loadProfileDraft().value?.rawText, '想减脂')
})

test('profile and unfinished profile draft save and load independently', () => {
  installStorage()
  const draft = createEmptyProfileDraft()
  draft.facts.heightCm = 172
  const profile = createUserProfile(draft, ['heightCm'], [])
  assert.equal(saveProfile(profile).ok, true)
  assert.equal(saveProfileDraft(createDraft()).ok, true)
  assert.equal(loadProfile().value?.facts.heightCm, 172)
  assert.equal(loadProfileDraft().value?.currentQuestionId, 'baselineWeightKg')
})

test('missing profile keys load as null and damaged JSON stays untouched', () => {
  const storage = installStorage()
  assert.equal(loadProfile().value, null)
  storage.setItem(PROFILE_STORAGE_KEY, '{broken')
  assert.equal(loadProfile().value, null)
  assert.equal(storage.getItem(PROFILE_STORAGE_KEY), '{broken')
})

test('profile version errors are rejected and individual invalid fields normalize', () => {
  const storage = installStorage()
  storage.setItem(PROFILE_STORAGE_KEY, JSON.stringify({ version: 2, profile: {} }))
  assert.equal(loadProfile().value, null)

  const draft = createEmptyProfileDraft()
  draft.facts.heightCm = 172
  const profile = createUserProfile(draft, [], [])
  storage.setItem(
    PROFILE_STORAGE_KEY,
    JSON.stringify({
      version: 1,
      profile: { ...profile, facts: { ...profile.facts, age: 999 } },
    }),
  )
  const loaded = loadProfile().value
  assert.equal(loaded?.facts.heightCm, 172)
  assert.equal(loaded?.facts.age, null)
})

test('damaged parsed draft preserves recoverable raw text without crashing', () => {
  const storage = installStorage()
  storage.setItem(
    PROFILE_DRAFT_STORAGE_KEY,
    JSON.stringify({ ...createDraft(), parsedDraft: { broken: true } }),
  )
  const loaded = loadProfileDraft()
  assert.equal(loaded.value?.rawText, '想减脂')
  assert.equal(loaded.value?.parsedDraft, null)
  assert.match(loaded.warning ?? '', /部分损坏/)
})

test('storage write failures return errors instead of throwing', () => {
  const storage = installStorage()
  storage.setItem = () => { throw new DOMException('Quota exceeded') }
  const profile = createUserProfile(createEmptyProfileDraft(), [], [])
  assert.equal(saveProfile(profile).ok, false)
  assert.equal(saveProfileDraft(createDraft()).ok, false)
})

test('finishing removes the draft and clearing profile never removes daily records', () => {
  const storage = installStorage()
  storage.setItem(RECORDS_KEY, '{"version":1,"records":{}}')
  saveProfile(createUserProfile(createEmptyProfileDraft(), [], []))
  saveProfileDraft(createDraft())
  assert.equal(removeProfileDraft().ok, true)
  assert.equal(storage.getItem(PROFILE_DRAFT_STORAGE_KEY), null)
  saveProfileDraft(createDraft())
  assert.equal(clearProfileData().ok, true)
  assert.equal(storage.getItem(PROFILE_STORAGE_KEY), null)
  assert.equal(storage.getItem(PROFILE_DRAFT_STORAGE_KEY), null)
  assert.equal(storage.getItem(RECORDS_KEY), '{"version":1,"records":{}}')
})

test('a failed draft removal leaves the confirmed profile and daily records intact', () => {
  const storage = installStorage()
  saveProfile(createUserProfile(createEmptyProfileDraft(), [], []))
  saveProfileDraft(createDraft())
  storage.setItem(RECORDS_KEY, 'daily-records')
  const originalProfile = storage.getItem(PROFILE_STORAGE_KEY)
  const originalDraft = storage.getItem(PROFILE_DRAFT_STORAGE_KEY)
  const removedKeys: string[] = []
  storage.removeItem = (key) => {
    removedKeys.push(key)
    if (key === PROFILE_DRAFT_STORAGE_KEY) {
      throw new Error('Storage unavailable')
    }
    storage.data.delete(key)
  }

  assert.deepEqual(clearProfileData(), { ok: false, error: '无法清除个人档案草稿。' })
  assert.deepEqual(removedKeys, [PROFILE_DRAFT_STORAGE_KEY])
  assert.equal(storage.getItem(PROFILE_STORAGE_KEY), originalProfile)
  assert.equal(storage.getItem(PROFILE_DRAFT_STORAGE_KEY), originalDraft)
  assert.equal(storage.getItem(RECORDS_KEY), 'daily-records')
})

test('a failed profile removal preserves the confirmed profile and reports failure', () => {
  const storage = installStorage()
  saveProfile(createUserProfile(createEmptyProfileDraft(), [], []))
  saveProfileDraft(createDraft())
  storage.setItem(RECORDS_KEY, 'daily-records')
  const originalProfile = storage.getItem(PROFILE_STORAGE_KEY)
  storage.removeItem = (key) => {
    if (key === PROFILE_STORAGE_KEY) {
      throw new Error('Storage unavailable')
    }
    storage.data.delete(key)
  }

  assert.deepEqual(clearProfileData(), { ok: false, error: '无法清除个人档案。' })
  assert.equal(storage.getItem(PROFILE_STORAGE_KEY), originalProfile)
  assert.equal(storage.getItem(PROFILE_DRAFT_STORAGE_KEY), null)
  assert.equal(storage.getItem(RECORDS_KEY), 'daily-records')
})
