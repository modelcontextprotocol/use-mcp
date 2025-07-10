import { SupportedProvider, providers, PROVIDER_TOKEN_KEY_PREFIX } from '../types/models'

// Types for OAuth tokens
export interface OAuthToken {
  access_token: string
  refresh_token?: string
  expires_at?: number
  token_type: 'Bearer'
}

// Types for PKCE flow
interface PKCEState {
  code_verifier: string
  state: string
}

// Generate a random code verifier for PKCE
function generateCodeVerifier(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

// Generate code challenge from verifier
async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

// Generate random state parameter
function generateState(): string {
  const array = new Uint8Array(16)
  crypto.getRandomValues(array)
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

// API Key functions (existing functionality)
export function hasApiKey(providerId: SupportedProvider): boolean {
  const provider = providers[providerId]
  if (provider.authType === 'oauth') {
    return hasOAuthToken(providerId)
  }

  const key = localStorage.getItem(PROVIDER_TOKEN_KEY_PREFIX + providerId)
  return key !== null && key.length > 0
}

export function getApiKey(providerId: SupportedProvider): string | null {
  return localStorage.getItem(PROVIDER_TOKEN_KEY_PREFIX + providerId)
}

export function setApiKey(providerId: SupportedProvider, apiKey: string): void {
  localStorage.setItem(PROVIDER_TOKEN_KEY_PREFIX + providerId, apiKey)
}

export function clearApiKey(providerId: SupportedProvider): void {
  localStorage.removeItem(PROVIDER_TOKEN_KEY_PREFIX + providerId)
}

// OAuth functions
export function hasOAuthToken(providerId: SupportedProvider): boolean {
  const token = getOAuthToken(providerId)
  if (!token) return false

  // Check if token is expired
  if (token.expires_at && token.expires_at < Date.now()) {
    return false
  }

  return true
}

export function getOAuthToken(providerId: SupportedProvider): OAuthToken | null {
  try {
    const tokenJson = localStorage.getItem(PROVIDER_TOKEN_KEY_PREFIX + providerId)
    if (!tokenJson) return null

    const token = JSON.parse(tokenJson) as OAuthToken
    return token
  } catch (error) {
    console.error('Failed to parse OAuth token:', error)
    return null
  }
}

export function setOAuthToken(providerId: SupportedProvider, token: OAuthToken): void {
  localStorage.setItem(PROVIDER_TOKEN_KEY_PREFIX + providerId, JSON.stringify(token))
}

export function clearOAuthToken(providerId: SupportedProvider): void {
  localStorage.removeItem(PROVIDER_TOKEN_KEY_PREFIX + providerId)
}

// PKCE OAuth flow functions
export async function beginOAuthFlow(providerId: SupportedProvider): Promise<void> {
  const provider = providers[providerId]
  if (!provider.oauth) {
    throw new Error(`Provider ${providerId} does not support OAuth`)
  }

  const codeVerifier = generateCodeVerifier()
  const codeChallenge = await generateCodeChallenge(codeVerifier)
  const state = generateState()

  // Store PKCE state in sessionStorage
  const pkceState: PKCEState = { code_verifier: codeVerifier, state }
  const storageKey = providerId === 'openrouter' ? `pkce_${providerId}_${Date.now()}` : `pkce_${providerId}_${state}`
  sessionStorage.setItem(storageKey, JSON.stringify(pkceState))

  // Construct authorization URL based on provider
  let authUrl: URL

  if (providerId === 'openrouter') {
    // OpenRouter uses a different OAuth flow
    authUrl = new URL(provider.oauth.authorizeUrl)
    authUrl.searchParams.set('callback_url', getRedirectUri(providerId))
    authUrl.searchParams.set('code_challenge', codeChallenge)
    authUrl.searchParams.set('code_challenge_method', 'S256')
  } else {
    // Standard OAuth2 flow for other providers
    authUrl = new URL(provider.oauth.authorizeUrl)
    authUrl.searchParams.set('client_id', provider.oauth.clientId)
    authUrl.searchParams.set('redirect_uri', getRedirectUri(providerId))
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('scope', provider.oauth.scopes.join(' '))
    authUrl.searchParams.set('state', state)
    authUrl.searchParams.set('code_challenge', codeChallenge)
    authUrl.searchParams.set('code_challenge_method', 'S256')
  }

  // Open popup or redirect
  const popup = window.open(authUrl.toString(), `oauth_${providerId}`, 'width=600,height=700')

  if (!popup) {
    throw new Error('Failed to open OAuth popup. Please allow popups for this site.')
  }
}

export async function completeOAuthFlow(providerId: SupportedProvider, code: string, state: string): Promise<void> {
  const provider = providers[providerId]
  if (!provider.oauth) {
    throw new Error(`Provider ${providerId} does not support OAuth`)
  }

  // Retrieve PKCE state
  let pkceState: PKCEState

  if (state === 'no-state' && providerId === 'openrouter') {
    // OpenRouter doesn't use state, find the most recent PKCE state for this provider
    const allKeys = Object.keys(sessionStorage)
    const pkceKeys = allKeys.filter((key) => key.startsWith(`pkce_${providerId}_`))

    if (pkceKeys.length === 0) {
      throw new Error('PKCE state not found. Please try again.')
    }

    // Use the most recent one (they should all be the same since we only allow one at a time)
    const pkceStateJson = sessionStorage.getItem(pkceKeys[0])!
    pkceState = JSON.parse(pkceStateJson)

    // Clean up the state
    sessionStorage.removeItem(pkceKeys[0])
  } else {
    const pkceStateJson = sessionStorage.getItem(`pkce_${providerId}_${state}`)
    if (!pkceStateJson) {
      throw new Error('PKCE state not found. Please try again.')
    }
    pkceState = JSON.parse(pkceStateJson)
  }

  // Exchange code for token
  let tokenResponse: Response

  if (providerId === 'openrouter') {
    // OpenRouter uses JSON body instead of form data
    tokenResponse = await fetch(provider.oauth.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        code,
        code_verifier: pkceState.code_verifier,
        code_challenge_method: 'S256',
      }),
    })
  } else {
    // Standard OAuth2 flow for other providers
    tokenResponse = await fetch(provider.oauth.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: provider.oauth.clientId,
        code,
        redirect_uri: getRedirectUri(providerId),
        code_verifier: pkceState.code_verifier,
      }),
    })
  }

  if (!tokenResponse.ok) {
    throw new Error(`Token exchange failed: ${tokenResponse.status} ${tokenResponse.statusText}`)
  }

  const tokenData = await tokenResponse.json()

  // Store token with expiration
  let token: OAuthToken

  if (providerId === 'openrouter') {
    // OpenRouter returns { key: "..." }
    token = {
      access_token: tokenData.key,
      token_type: 'Bearer',
    }
  } else {
    // Standard OAuth2 response
    token = {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: tokenData.expires_in ? Date.now() + tokenData.expires_in * 1000 : undefined,
      token_type: 'Bearer',
    }
  }

  setOAuthToken(providerId, token)

  // Clean up PKCE state (already cleaned up above for OpenRouter)
  if (state !== 'no-state') {
    sessionStorage.removeItem(`pkce_${providerId}_${state}`)
  }
}

// Get authentication headers for API calls
export async function getAuthHeaders(providerId: SupportedProvider): Promise<Record<string, string>> {
  const provider = providers[providerId]

  if (provider.authType === 'oauth') {
    const token = getOAuthToken(providerId)
    if (!token) {
      throw new Error(`No OAuth token found for ${providerId}`)
    }

    return {
      Authorization: `Bearer ${token.access_token}`,
    }
  } else {
    // API key authentication
    const apiKey = getApiKey(providerId)
    if (!apiKey) {
      throw new Error(`No API key found for ${providerId}`)
    }

    if (provider.apiKeyHeader === 'Authorization') {
      return {
        Authorization: `Bearer ${apiKey}`,
      }
    } else {
      return {
        [provider.apiKeyHeader!]: apiKey,
      }
    }
  }
}

// Helper function to get redirect URI
function getRedirectUri(providerId: SupportedProvider): string {
  const baseUrl = window.location.origin
  return `${baseUrl}/oauth/${providerId}/callback`
}
