import type { AiApiErrorBody } from './types.js'

export class AiRequestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AiRequestError'
  }
}

type AiRequestOptions<T> = {
  endpoint: string
  body: unknown
  signal: AbortSignal
  parseResponse: (payload: unknown) => T
  messages: {
    network: string
    fallback: string
    invalidResponse: string
    codes: Partial<Record<AiApiErrorBody['code'], string>>
  }
}

const isAbortError = (error: unknown) =>
  error instanceof Error && error.name === 'AbortError'

export const requestAiJson = async <T>({
  endpoint,
  body,
  signal,
  parseResponse,
  messages,
}: AiRequestOptions<T>): Promise<T> => {
  let response: Response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
  } catch (error) {
    if (isAbortError(error)) {
      throw error
    }
    throw new AiRequestError(messages.network)
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch (error) {
    if (isAbortError(error)) {
      throw error
    }
    throw new AiRequestError(messages.fallback)
  }

  if (!response.ok) {
    const code =
      payload !== null &&
      typeof payload === 'object' &&
      Object.hasOwn(payload, 'code') &&
      'code' in payload
        ? payload.code
        : undefined
    const message =
      typeof code === 'string' && Object.hasOwn(messages.codes, code)
        ? messages.codes[code as AiApiErrorBody['code']]
        : undefined
    throw new AiRequestError(message ?? messages.fallback)
  }

  try {
    return parseResponse(payload)
  } catch {
    throw new AiRequestError(messages.invalidResponse)
  }
}
