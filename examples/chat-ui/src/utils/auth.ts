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
  // TODO: Add state support back if needed later
  // state: string
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

// TODO: Add state generation back if needed later
// function generateState(): string {
//   const array = new Uint8Array(16)
//   crypto.getRandomValues(array)
//   return btoa(String.fromCharCode(...array))
//     .replace(/\+/g, '-')
//     .replace(/\//g, '_')
//     .replace(/=/g, '')
// }

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

  console.log('DEBUG: Generated PKCE values for', providerId, {
    codeVerifier: codeVerifier,
    codeChallenge: codeChallenge,
    verifierLength: codeVerifier.length,
    challengeLength: codeChallenge.length,
  })

  // Store PKCE state in sessionStorage (one key per provider)
  const pkceState: PKCEState = { code_verifier: codeVerifier }
  const storageKey = `pkce_${providerId}`
  sessionStorage.setItem(storageKey, JSON.stringify(pkceState))

  // Construct authorization URL based on provider
  let authUrl: URL

  if (providerId === 'openrouter') {
    // OpenRouter uses a different redirect name flow
    authUrl = new URL(provider.oauth.authorizeUrl)
    authUrl.searchParams.set('callback_url', getRedirectUri(providerId))
  } else {
    // Groq uses redirect_uri
    authUrl = new URL(provider.oauth.authorizeUrl)
    authUrl.searchParams.set('redirect_uri', getRedirectUri(providerId))
  }
  authUrl.searchParams.set('code_challenge', codeChallenge)
  authUrl.searchParams.set('code_challenge_method', 'S256')
  // TODO: Add state parameter back if needed later
  // authUrl.searchParams.set('state', state)

  // Open popup or redirect
  console.log('DEBUG: Opening OAuth popup for', providerId, 'with URL:', authUrl.toString())
  const popup = window.open(authUrl.toString(), `oauth_${providerId}`, 'width=600,height=700')

  if (!popup) {
    throw new Error('Failed to open OAuth popup. Please allow popups for this site.')
  }

  console.log('DEBUG: Popup opened successfully:', popup)
  console.log('DEBUG: Popup closed:', popup.closed)
}

export async function completeOAuthFlow(providerId: SupportedProvider, code: string): Promise<void> {
  console.log('DEBUG: Starting OAuth completion for', providerId, 'with code:', code?.substring(0, 10) + '...')
  console.log('DEBUG: Full code for debugging:', code)
  console.log('DEBUG: Provider config:', providers[providerId])

  const provider = providers[providerId]
  if (!provider.oauth) {
    throw new Error(`Provider ${providerId} does not support OAuth`)
  }

  // Retrieve PKCE state (single key per provider)
  const storageKey = `pkce_${providerId}`
  const pkceStateJson = sessionStorage.getItem(storageKey)

  console.log('DEBUG: Looking for PKCE key:', storageKey)

  if (!pkceStateJson) {
    throw new Error('PKCE state not found. Please try again.')
  }

  const pkceState: PKCEState = JSON.parse(pkceStateJson)

  console.log('DEBUG: Using PKCE state:', { key: storageKey, state: pkceState })
  console.log('DEBUG: Code verifier length:', pkceState.code_verifier.length)
  console.log('DEBUG: Code verifier sample:', pkceState.code_verifier.substring(0, 20) + '...')

  // Test: regenerate challenge from verifier to verify it matches server expectation
  const recomputedChallenge = await generateCodeChallenge(pkceState.code_verifier)
  console.log('DEBUG: Recomputed challenge from verifier:', recomputedChallenge)
  console.log('DEBUG: Server reported challenge was: dW2iEvNljlkhcRcryo3Z0GITcJM1liKcHlB5v8CDEu8')

  // Clean up the state
  sessionStorage.removeItem(storageKey)

  // Exchange code for token
  let tokenResponse: Response

  if (providerId === 'openrouter') {
    // OpenRouter uses JSON body instead of form data
    const requestBody = {
      code,
      code_verifier: pkceState.code_verifier,
      code_challenge_method: 'S256',
    }
    console.log('DEBUG: OpenRouter token request:', {
      url: provider.oauth.tokenUrl,
      body: requestBody,
    })

    const startTime = performance.now()
    tokenResponse = await fetch(provider.oauth.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })
    const endTime = performance.now()

    console.log('DEBUG: OpenRouter token response:', {
      status: tokenResponse.status,
      statusText: tokenResponse.statusText,
      headers: Object.fromEntries(tokenResponse.headers.entries()),
      duration: `${endTime - startTime}ms`,
    })
  } else {
    // Standard OAuth2 flow for other providers (Groq)
    const requestBody = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: getRedirectUri(providerId),
      code_verifier: pkceState.code_verifier,
    })

    console.log('DEBUG: Groq token request:', {
      url: provider.oauth.tokenUrl,
      body: Object.fromEntries(requestBody.entries()),
      codeVerifierLength: pkceState.code_verifier.length,
      codeVerifierSample: pkceState.code_verifier.substring(0, 20) + '...',
      fullCodeVerifier: pkceState.code_verifier, // For debugging
    })

    const startTime = performance.now()
    tokenResponse = await fetch(provider.oauth.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: requestBody,
    })
    const endTime = performance.now()

    console.log('DEBUG: Groq token response:', {
      status: tokenResponse.status,
      statusText: tokenResponse.statusText,
      headers: Object.fromEntries(tokenResponse.headers.entries()),
      duration: `${endTime - startTime}ms`,
    })
  }

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text()
    console.error('DEBUG: Token exchange error response:', errorText)
    throw new Error(`Token exchange failed: ${tokenResponse.status} ${tokenResponse.statusText}`)
  }

  const tokenData = await tokenResponse.json()
  console.log('DEBUG: Token response data:', tokenData)

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

  // PKCE state already cleaned up above
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

// Test function to verify PKCE implementation with known values
export async function testPKCEImplementation(): Promise<void> {
  console.log('=== TESTING PKCE IMPLEMENTATION ===')

  // Test with a known code verifier (from RFC 7636 example)
  const testVerifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
  const expectedChallenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'

  const computedChallenge = await generateCodeChallenge(testVerifier)

  console.log('DEBUG: Test verifier:', testVerifier)
  console.log('DEBUG: Expected challenge:', expectedChallenge)
  console.log('DEBUG: Computed challenge:', computedChallenge)
  console.log('DEBUG: Challenges match:', computedChallenge === expectedChallenge)

  // Test with current implementation
  const currentVerifier = generateCodeVerifier()
  const currentChallenge = await generateCodeChallenge(currentVerifier)

  console.log('DEBUG: Current verifier:', currentVerifier)
  console.log('DEBUG: Current challenge:', currentChallenge)
  console.log('DEBUG: Verifier length:', currentVerifier.length)
  console.log('DEBUG: Challenge length:', currentChallenge.length)

  console.log('=== END PKCE TEST ===')
}
