import assert from 'node:assert/strict'
import test from 'node:test'
import { readSupabaseConfiguration } from '../src/auth/config.ts'

const publishable = 'sb_publishable_synthetic_test_key'

test('auth remains local only when both configuration values are absent', () => {
  assert.deepEqual(readSupabaseConfiguration(undefined, undefined), { config: null, error: null })
  assert.deepEqual(readSupabaseConfiguration(' ', ''), { config: null, error: null })
  for (const [url, key] of [['https://example.supabase.co', ''], ['', publishable]]) {
    const result = readSupabaseConfiguration(url, key)
    assert.equal(result.config, null)
    assert.ok(result.error)
  }
})

test('auth accepts HTTPS public configuration and local development origins', () => {
  assert.deepEqual(readSupabaseConfiguration(' https://example.supabase.co/ ', ` ${publishable} `), {
    config: { url: 'https://example.supabase.co', publishableKey: publishable }, error: null,
  })
  for (const origin of ['http://localhost:54321', 'http://127.0.0.1:54321', 'http://[::1]:54321']) {
    assert.equal(readSupabaseConfiguration(origin, publishable).config?.url, origin)
  }
})

test('auth rejects unsafe URLs and non-public keys without echoing supplied values', () => {
  for (const url of ['invalid', 'javascript:alert(1)', 'http://example.supabase.co', 'https://user:private@example.supabase.co', 'https://example.supabase.co/auth/v1', 'https://example.supabase.co?private=hidden', 'https://example.supabase.co#hidden']) {
    const result = readSupabaseConfiguration(url, publishable)
    assert.equal(result.config, null)
    assert.ok(result.error)
    assert.equal(result.error.includes(url), false)
  }
  const serviceRole = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.synthetic`
  for (const key of ['sb_secret_synthetic_private_value', serviceRole, 'sb_publishable_', 'sb_publishable_bad key']) {
    const result = readSupabaseConfiguration('https://example.supabase.co', key)
    assert.equal(result.config, null)
    assert.ok(result.error)
    if (key !== 'sb_publishable_') assert.equal(result.error.includes(key), false)
  }
})
