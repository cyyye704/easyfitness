import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { officialUrl, regionOrigins, type CorosConfig, type CorosRegion } from './config.js'
import { CorosError, isObject, isTokenString, readBoundedJson, reconnectError, upstreamError } from './http.js'

const UPSTREAM_TIMEOUT_MS = 8_000
export type CorosFlow = {
  userId: string
  state: string
  verifier: string
  clientId: string
  endpoint: string
  tokenEndpoint: string
  revocationEndpoint: string
  region: CorosRegion
}
export type CorosConnection = {
  userId: string
  clientId: string
  endpoint: string
  tokenEndpoint: string
  revocationEndpoint: string
  region: CorosRegion
  accessToken: string
  refreshToken?: string
  expiresAt: number
}
type Metadata = {
  issuer: string
  authorizationEndpoint: string
  tokenEndpoint: string
  registrationEndpoint: string
  revocationEndpoint: string
}

const cachedClients = new Map<string, string>()

const requestJson = async (url: string, init: RequestInit, signal: AbortSignal) => {
  const boundedSignal = AbortSignal.any([signal, AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)])
  try {
    const response = await fetch(url, {
      ...init, signal: boundedSignal, redirect: 'error', cache: 'no-store',
    })
    if (!response.ok) {
      // Only token failures invalidate a connection. Provider/network failures stay retryable.
      if (url.endsWith('/oauth2/token') && [400, 401, 403].includes(response.status)) throw reconnectError()
      if (response.status === 429) throw new CorosError(429, 'COROS_RATE_LIMITED', 'COROS 请求过于频繁，请稍后重试。')
      throw upstreamError()
    }
    const body = await readBoundedJson(response)
    boundedSignal.throwIfAborted()
    if (!isObject(body)) throw upstreamError()
    return body
  } catch (error) {
    if (error instanceof CorosError) throw error
    throw upstreamError()
  }
}

const discover = async (region: CorosRegion, signal: AbortSignal): Promise<Metadata> => {
  const data = await requestJson(`${regionOrigins[region]}/.well-known/oauth-authorization-server`, {
    headers: { Accept: 'application/json' },
  }, signal)
  const issuer = officialUrl(data.issuer, '/')
  const issuerOrigin = new URL(issuer).origin
  const checkedEndpoint = (value: unknown, path: string) => {
    const endpoint = officialUrl(value, path)
    if (new URL(endpoint).origin !== issuerOrigin) throw upstreamError()
    return endpoint
  }
  if (
    !Array.isArray(data.code_challenge_methods_supported) || !data.code_challenge_methods_supported.includes('S256') ||
    !Array.isArray(data.token_endpoint_auth_methods_supported) || !data.token_endpoint_auth_methods_supported.includes('none')
  ) throw upstreamError()
  return {
    issuer: issuerOrigin,
    authorizationEndpoint: checkedEndpoint(data.authorization_endpoint, '/oauth2/authorize'),
    tokenEndpoint: checkedEndpoint(data.token_endpoint, '/oauth2/token'),
    registrationEndpoint: checkedEndpoint(data.registration_endpoint, '/connect/register'),
    revocationEndpoint: checkedEndpoint(data.revocation_endpoint, '/oauth2/revoke'),
  }
}

const registerClient = async (metadata: Metadata, config: CorosConfig, signal: AbortSignal) => {
  if (config.clientId) return config.clientId
  const redirectUri = `${config.origin}/api/coros`
  const key = `${metadata.issuer}:${redirectUri}`
  const cached = cachedClients.get(key)
  if (cached) return cached
  const data = await requestJson(metadata.registrationEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_name: 'EasyFitness',
      redirect_uris: [redirectUri],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope: 'openid offline_access mcp.tools',
    }),
  }, signal)
  if (
    !isTokenString(data.client_id, 512) ||
    (data.token_endpoint_auth_method !== undefined && data.token_endpoint_auth_method !== 'none')
  ) throw upstreamError()
  if (cachedClients.size >= 16) cachedClients.clear()
  cachedClients.set(key, data.client_id)
  return data.client_id
}

export const startAuthorization = async (
  userId: string, region: CorosRegion, config: CorosConfig, signal: AbortSignal,
) => {
  const metadata = await discover(region, signal)
  const clientId = await registerClient(metadata, config, signal)
  const state = randomBytes(32).toString('base64url')
  const verifier = randomBytes(32).toString('base64url')
  const endpoint = `${metadata.issuer}/mcp`
  const resolvedRegion = Object.entries(regionOrigins).find(([, origin]) => origin === metadata.issuer)?.[0] as CorosRegion | undefined
  const flow: CorosFlow = {
    userId, state, verifier, clientId, endpoint,
    tokenEndpoint: metadata.tokenEndpoint,
    revocationEndpoint: metadata.revocationEndpoint,
    region: resolvedRegion ?? region,
  }
  const url = new URL(metadata.authorizationEndpoint)
  url.search = new URLSearchParams({
    response_type: 'code', client_id: clientId,
    redirect_uri: `${config.origin}/api/coros`,
    scope: 'openid offline_access mcp.tools', state,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256', resource: endpoint,
  }).toString()
  return { authorizationUrl: url.href, flow }
}

export const validState = (actual: string | null, expected: string): boolean => {
  if (!actual || !/^[A-Za-z0-9_-]{43}$/.test(actual) || actual.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
}

const parseTokens = (data: Record<string, unknown>, previous?: CorosConnection) => {
  const accessToken = data.access_token
  const refreshToken = data.refresh_token ?? previous?.refreshToken
  if (
    !isTokenString(accessToken, 6_000) ||
    (refreshToken !== undefined && !isTokenString(refreshToken, 6_000)) ||
    typeof data.token_type !== 'string' || data.token_type.toLowerCase() !== 'bearer' ||
    typeof data.expires_in !== 'number' || !Number.isFinite(data.expires_in) || data.expires_in <= 0 || data.expires_in > 180 * 24 * 60 * 60 ||
    (data.scope !== undefined && (typeof data.scope !== 'string' || !data.scope.split(' ').includes('mcp.tools')))
  ) throw upstreamError()
  return { accessToken, ...(refreshToken ? { refreshToken } : {}), expiresAt: Date.now() + data.expires_in * 1_000 }
}

const exchange = (endpoint: string, body: Record<string, string>, signal: AbortSignal) =>
  requestJson(officialUrl(endpoint, '/oauth2/token'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams(body).toString(),
  }, signal)

export const finishAuthorization = async (
  flow: CorosFlow, code: string, config: CorosConfig, signal: AbortSignal,
): Promise<CorosConnection> => {
  const data = await exchange(flow.tokenEndpoint, {
    grant_type: 'authorization_code', code, client_id: flow.clientId,
    redirect_uri: `${config.origin}/api/coros`, code_verifier: flow.verifier, resource: flow.endpoint,
  }, signal)
  return {
    userId: flow.userId, clientId: flow.clientId, endpoint: flow.endpoint,
    tokenEndpoint: flow.tokenEndpoint, revocationEndpoint: flow.revocationEndpoint,
    region: flow.region, ...parseTokens(data),
  }
}

export const refreshConnection = async (connection: CorosConnection, signal: AbortSignal): Promise<CorosConnection> => {
  if (!connection.refreshToken) throw reconnectError()
  const data = await exchange(connection.tokenEndpoint, {
    grant_type: 'refresh_token', refresh_token: connection.refreshToken,
    client_id: connection.clientId, resource: connection.endpoint,
  }, signal)
  return { ...connection, ...parseTokens(data, connection) }
}

export const revokeConnection = async (connection: CorosConnection, signal: AbortSignal) => {
  // Clearing this browser's sealed connection succeeds even if COROS is temporarily offline.
  try {
    await fetch(officialUrl(connection.revocationEndpoint, '/oauth2/revoke'), {
      method: 'POST', redirect: 'error', cache: 'no-store',
      signal: AbortSignal.any([signal, AbortSignal.timeout(3_000)]),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: connection.clientId,
        token: connection.refreshToken ?? connection.accessToken,
        token_type_hint: connection.refreshToken ? 'refresh_token' : 'access_token',
      }).toString(),
    })
  } catch { /* Do not expose upstream bodies or token material. */ }
}
