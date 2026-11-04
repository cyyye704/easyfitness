import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CorosMcpError, fetchCorosPreview, readMcpResponse } from '../api/_lib/coros/mcp.ts'
import { parseCorosMetric, parseCorosPreview } from '../api/_lib/coros/parser.ts'

const textResult = (text: string) => ({ content: [{ type: 'text', text }] })
const now = new Date('2026-10-16T10:00:00.000Z')
// Sleep fixture is from the official COROS tools guide. Calorie fixtures below
// test explicit labels/units defensively; they are not claimed as live responses.
const officialSleepExample = `Sleep Overview

2026-10-15
Sleep Score: 91
Daily Sleep: 7h 57min (incl. naps)
Main Sleep (asleep): 7h 57min
Deep Sleep Ratio: 27%
Light Sleep Ratio: 41%
REM Ratio: 31%
Awake Time: 5 min
Main Sleep Window: 2026-10-15 00:28 - 2026-10-15 08:30
Naps Total: 0 min`

test('COROS documented daily sleep uses wake-up date and does not sum stages or naps again', () => {
  const result = parseCorosMetric(textResult(officialSleepExample), 'sleep', now)
  assert.deepEqual([...result.values], [['2026-10-15', 7.95]])
  assert.deepEqual(result.warnings, [])
})

test('explicit active calories require kcal and stay separate from other calorie types', () => {
  const result = parseCorosPreview(textResult(`2026-10-15
Total Calories: 2500 kcal
Calories: 1700 kcal
Active Calories: 450.5 kcal
Workout Calories: 250 kcal`), textResult(officialSleepExample), now)
  assert.deepEqual(result.days, [{
    sourceDate: '2026-10-15', sleepHours: 7.95, activeCaloriesKcal: 450.5, syncedAt: now.toISOString(),
  }])
  assert.deepEqual(result.warnings, [])
})

test('ambiguous units, unlabelled JSON numbers and generic Calories are never guessed', () => {
  for (const text of [
    '2026-10-15\nActive Calories: 450',
    '2026-10-15\nActive Calories: 450000 cal',
    '2026-10-15\nCalories: 450 kcal',
    '2026-10-15\nTotal Calories: 2450 kcal',
    '{"date":"2026-10-15","calories":450000}',
  ]) {
    const result = parseCorosMetric(textResult(text), 'calories', now)
    assert.equal(result.values.size, 0)
    assert.ok(result.warnings.length > 0)
  }
})

test('explicit units in a table heading are supported and zero stays zero', () => {
  const result = parseCorosMetric(textResult(`| Date | Steps | Active Calories (kcal) |
| --- | --- | --- |
| 2026-10-15 | 3000 | 150 |
| 2026-10-16 | 0 | 0 |`), 'calories', now)
  assert.deepEqual([...result.values], [['2026-10-15', 150], ['2026-10-16', 0]])
})

test('duplicate identical data is coalesced; conflicting daily values are omitted', () => {
  const identical = parseCorosMetric(textResult('2026-10-15\nActive Calories: 450 kcal\n2026-10-15\nActive Calories: 450 kcal'), 'calories', now)
  assert.deepEqual([...identical.values], [['2026-10-15', 450]])
  const conflict = parseCorosMetric(textResult('2026-10-15\nActive Calories: 450 kcal\n2026-10-15\nActive Calories: 550 kcal\nActive Calories: 450 kcal'), 'calories', now)
  assert.equal(conflict.values.size, 0)
  assert.ok(conflict.warnings.some((warning) => warning.includes('冲突')))
})

test('sleep malformed values, impossible dates and out-of-window dates are skipped', () => {
  for (const text of [
    '2026-10-15\nDaily Sleep: 7h 99min',
    '2026-10-15\nDaily Sleep: 25h',
    '2026-10-15\nDaily Sleep: 7:57',
    '2026-02-30\nDaily Sleep: 7h 57min',
    '2025-10-15\nDaily Sleep: 7h 57min',
    '2026-10-20\nDaily Sleep: 7h 57min',
    'Daily Sleep: 7h 57min',
  ]) {
    const result = parseCorosMetric(textResult(text), 'sleep', now)
    assert.equal(result.values.size, 0)
    assert.ok(result.warnings.length)
  }
})

test('partial data returns explicit warnings and missing values remain null', () => {
  const result = parseCorosPreview({ isError: true, content: [{ type: 'text', text: 'private upstream detail' }] }, textResult(officialSleepExample), now)
  assert.equal(result.days.length, 1)
  assert.equal(result.days[0].activeCaloriesKcal, null)
  assert.ok(result.warnings.some((warning) => warning.includes('活动热量')))
  assert.doesNotMatch(JSON.stringify(result), /private upstream detail/)
})

test('an unsupported next date cannot silently attach its values to the preceding day', () => {
  for (const unsupportedDate of ['2026/10/16', '2026-10-16 (Today)', 'Date: 20261016']) {
    const result = parseCorosMetric(textResult(`2026-10-15\nSleep Score: 91\n${unsupportedDate}\nDaily Sleep: 8h`), 'sleep', now)
    assert.equal(result.values.size, 0)
    assert.ok(result.warnings.length)
  }
})

test('independent MCP text blocks never share a date context', () => {
  const result = parseCorosMetric({ content: [
    { type: 'text', text: '2026-10-15\nSleep Score: 91' },
    { type: 'text', text: 'Daily Sleep: 8h' },
  ] }, 'sleep', now)
  assert.equal(result.values.size, 0)
  assert.ok(result.warnings.length)
})

const rpcResponse = (id: number, result: unknown, headers: HeadersInit = {}) => new Response(JSON.stringify({ jsonrpc: '2.0', id, result }), {
  headers: { 'Content-Type': 'application/json', ...headers },
})

test('JSON RPC responses validate id and return only the matching result', async () => {
  const signal = new AbortController().signal
  assert.deepEqual(await readMcpResponse(rpcResponse(2, { content: [] }), 2, signal), { content: [] })
  await assert.rejects(readMcpResponse(rpcResponse(3, { content: [] }), 2, signal), CorosMcpError)
  await assert.rejects(readMcpResponse(new Response(JSON.stringify({ result: {} }), { headers: { 'Content-Type': 'application/json' } }), 2, signal), CorosMcpError)
})

test('SSE handles CRLF, chunks, notifications and a stream that stays open after its response', async () => {
  const encoder = new TextEncoder()
  let cancelled = false
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(': heartbeat\r\ndata: {"jsonrpc":"2.0","method":"notifications/progress"}\r\n\r\nevent: message\r\nda'))
      controller.enqueue(encoder.encode('ta: {"jsonrpc":"2.0",\r\ndata: "id":2,"result":{"content":[]}}\r\n\r\n'))
    },
    cancel() { cancelled = true },
  })
  const result = await readMcpResponse(new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } }), 2, new AbortController().signal)
  assert.deepEqual(result, { content: [] })
  assert.equal(cancelled, true)
})

test('MCP response size is capped while streaming', async () => {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new Uint8Array(262_145)); controller.close() },
  })
  await assert.rejects(readMcpResponse(new Response(stream, { headers: { 'Content-Type': 'application/json' } }), 1, new AbortController().signal), CorosMcpError)
})

test('aborting an open MCP stream cancels its reader', async () => {
  let cancelled = false
  const stream = new ReadableStream<Uint8Array>({ cancel() { cancelled = true } })
  const controller = new AbortController()
  const task = readMcpResponse(new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } }), 1, controller.signal)
  controller.abort(new DOMException('cancelled', 'AbortError'))
  await assert.rejects(task, { name: 'AbortError' })
  assert.equal(cancelled, true)
})

test('MCP upstream errors are sanitized and auth errors request reconnect', async () => {
  const signal = new AbortController().signal
  await assert.rejects(readMcpResponse(new Response('private-token', { status: 401 }), 1, signal), (error: unknown) => {
    assert.ok(error instanceof CorosMcpError)
    assert.equal(error.code, 'COROS_RECONNECT_REQUIRED')
    assert.doesNotMatch(error.message, /private-token/)
    return true
  })
  await assert.rejects(readMcpResponse(new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, error: { message: 'private health detail' } }), { headers: { 'Content-Type': 'application/json' } }), 1, signal), (error: unknown) => {
    assert.ok(error instanceof CorosMcpError)
    assert.doesNotMatch(error.message, /private health detail/)
    return true
  })
})

test('full MCP flow sends initialization, negotiated headers and only the two allowed read tools', async (context) => {
  const date = new Date().toISOString().slice(0, 10)
  const messages: Record<string, unknown>[] = []
  context.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://mcpcn.coros.com/mcp')
    assert.equal(options?.redirect, 'error')
    assert.equal(options?.cache, 'no-store')
    const headers = new Headers(options?.headers)
    assert.equal(headers.get('Authorization'), 'Bearer test-token')
    assert.equal(headers.get('Accept'), 'application/json, text/event-stream')
    const body = JSON.parse(String(options?.body))
    messages.push(body)
    if (body.method === 'initialize') return rpcResponse(1, { protocolVersion: '2025-06-18', capabilities: { tools: {} } }, { 'Mcp-Session-Id': 'test-session' })
    assert.equal(headers.get('Mcp-Session-Id'), 'test-session')
    assert.equal(headers.get('MCP-Protocol-Version'), '2025-06-18')
    if (body.method === 'notifications/initialized') return new Response(null, { status: 202 })
    assert.equal(body.method, 'tools/call')
    assert.deepEqual(body.params.arguments, { days: 7 })
    if (body.params.name === 'queryDailyHealthData') return rpcResponse(body.id, textResult(`${date}\nActive Calories: 390 kcal`))
    assert.equal(body.params.name, 'querySleepOverview')
    return rpcResponse(body.id, textResult(`${date}\nDaily Sleep: 8h 15min (incl. naps)`))
  })
  const result = await fetchCorosPreview({ accessToken: 'test-token', endpoint: 'https://mcpcn.coros.com/mcp', signal: new AbortController().signal })
  assert.equal(messages.length, 4)
  assert.equal(result.days[0].sleepHours, 8.25)
  assert.equal(result.days[0].activeCaloriesKcal, 390)
})

test('MCP missing optional data can be previewed; unknown data never becomes fabricated zeros', async (context) => {
  const date = new Date().toISOString().slice(0, 10)
  context.mock.method(globalThis, 'fetch', async (_url, options) => {
    const body = JSON.parse(String(options?.body))
    if (body.method === 'initialize') return rpcResponse(1, { protocolVersion: '2025-06-18' })
    if (body.method === 'notifications/initialized') return new Response(null, { status: 202 })
    return rpcResponse(body.id, body.params.name === 'querySleepOverview'
      ? textResult(`${date}\nDaily Sleep: 8h`)
      : textResult(`${date}\nCalories: 700000`))
  })
  const result = await fetchCorosPreview({ accessToken: 'test-token', endpoint: 'https://mcp.coros.com/mcp', signal: new AbortController().signal })
  assert.equal(result.days[0].sleepHours, 8)
  assert.equal(result.days[0].activeCaloriesKcal, null)
  assert.ok(result.warnings.length)
})

test('untrusted endpoints and pre-aborted requests never send an access token', async (context) => {
  const fetchMock = context.mock.method(globalThis, 'fetch', async () => assert.fail('must not fetch'))
  for (const endpoint of ['https://evil.example/mcp', 'https://mcp.coros.com.evil.example/mcp', 'http://mcpcn.coros.com/mcp', 'https://user@mcpcn.coros.com/mcp', 'https://mcpcn.coros.com:8443/mcp', 'https://mcpcn.coros.com/mcp?token=1']) {
    await assert.rejects(fetchCorosPreview({ accessToken: 'secret', endpoint, signal: new AbortController().signal }), CorosMcpError)
  }
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(fetchCorosPreview({ accessToken: 'secret', endpoint: 'https://mcp.coros.com/mcp', signal: controller.signal }), { name: 'AbortError' })
  assert.equal(fetchMock.mock.callCount(), 0)
})
