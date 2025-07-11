// browser-provider.test.ts
import { BrowserOAuthClientProvider } from '../src/auth/browser-provider.js'
import { StoredState } from '../src/auth/types.js'

// Mock localStorage for testing
class MockLocalStorage {
  private store: Record<string, string> = {}

  getItem(key: string): string | null {
    return this.store[key] || null
  }

  setItem(key: string, value: string): void {
    this.store[key] = value
  }

  removeItem(key: string): void {
    delete this.store[key]
  }

  clear(): void {
    this.store = {}
  }

  key(index: number): string | null {
    return Object.keys(this.store)[index] || null
  }

  get length(): number {
    return Object.keys(this.store).length
  }
}

// Mock window object
const mockWindow = {
  location: {
    origin: 'https://example.com', // doesn't matter
    href: 'https://example.com'
  },
  open: () => ({ focus: () => {}, closed: false }),
  close: () => {},
  opener: null,
  postMessage: () => {}
}

// Mock crypto
const mockCrypto = {
  randomUUID: () => 'test-uuid-123'
}

// Test runner
class TestRunner {
  private tests: Array<{ name: string; fn: () => void | Promise<void> }> = []
  private beforeEachFn: (() => void) | null = null
  private mockLocalStorage = new MockLocalStorage()

  constructor() {
    // Setup globals using globalThis (works everywhere)
    globalThis.localStorage = this.mockLocalStorage as any
    globalThis.window = mockWindow as any
    Object.defineProperty(globalThis.crypto, 'randomUUID', {
          value: mockCrypto.randomUUID,
          writable: true,
          configurable: true
        })
  }

  beforeEach(fn: () => void) {
    this.beforeEachFn = fn
  }

  test(name: string, fn: () => void | Promise<void>) {
    this.tests.push({ name, fn })
  }

  async run() {
    console.log(`Running ${this.tests.length} tests...\n`)
    
    if (this.tests.length === 0) {
      console.log('No tests found!')
      return true
    }
    
    let passed = 0
    let failed = 0

    for (const test of this.tests) {
      console.log(`Running: ${test.name}`)
      
      if (this.beforeEachFn) {
        this.beforeEachFn()
      }

      try {
        await test.fn()
        console.log(`✓ ${test.name}`)
        passed++
      } catch (error) {
        console.log(`✗ ${test.name}`)
        console.log(`  Error: ${error instanceof Error ? error.message : String(error)}`)
        failed++
      }
    }

    console.log(`\nResults: ${passed} passed, ${failed} failed`)
    return failed === 0
  }
}

// Simple assertion functions
function expect(actual: any) {
  return {
    toEqual: (expected: any) => {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
      }
    },
    toBe: (expected: any) => {
      if (actual !== expected) {
        throw new Error(`Expected ${expected}, got ${actual}`)
      }
    },
    toBeTruthy: () => {
      if (!actual) {
        throw new Error(`Expected truthy value, got ${actual}`)
      }
    },
    toBeNull: () => {
      if (actual !== null) {
        throw new Error(`Expected null, got ${actual}`)
      }
    },
    toBeUndefined: () => {
      if (actual !== undefined) {
        throw new Error(`Expected undefined, got ${actual}`)
      }
    },
    toContain: (expected: any) => {
      if (!actual.includes(expected)) {
        throw new Error(`Expected ${JSON.stringify(actual)} to contain ${expected}`)
      }
    },
    toBeGreaterThan: (expected: number) => {
      if (actual <= expected) {
        throw new Error(`Expected ${actual} to be greater than ${expected}`)
      }
    },
    toMatch: (regex: RegExp) => {
      if (!regex.test(actual)) {
        throw new Error(`Expected ${actual} to match ${regex}`)
      }
    }
  }
}

// Test suite
const runner = new TestRunner()
const serverUrl = 'https://test-server.com'

runner.beforeEach(() => {
  runner['mockLocalStorage'].clear()
})

// Constructor and Scope Initialization Tests
runner.test('should use default scope when no scopes provided', () => {
  const provider = new BrowserOAuthClientProvider(serverUrl)
  
  expect(provider.scopes).toEqual(['openid'])
  expect(provider.clientMetadata.scope).toBe('openid')
})

runner.test('should use default scope when empty scopes array provided', () => {
  const provider = new BrowserOAuthClientProvider(serverUrl, { scopes: [] })
  
  expect(provider.scopes).toEqual(['openid'])
  expect(provider.clientMetadata.scope).toBe('openid')
})

runner.test('should store and use custom scopes when provided', () => {
  const customScopes = ['file-operations', 'web-search', 'database-access']
  const provider = new BrowserOAuthClientProvider(serverUrl, { scopes: customScopes })
  
  expect(provider.scopes).toEqual(customScopes)
  expect(provider.clientMetadata.scope).toBe('file-operations web-search database-access')
})

runner.test('should handle single scope correctly', () => {
  const provider = new BrowserOAuthClientProvider(serverUrl, { scopes: ['file-operations'] })
  
  expect(provider.scopes).toEqual(['file-operations'])
  expect(provider.clientMetadata.scope).toBe('file-operations')
})

runner.test('should preserve scope order', () => {
  const orderedScopes = ['z-scope', 'a-scope', 'm-scope']
  const provider = new BrowserOAuthClientProvider(serverUrl, { scopes: orderedScopes })
  
  expect(provider.scopes).toEqual(orderedScopes)
  expect(provider.clientMetadata.scope).toBe('z-scope a-scope m-scope')
})

// Client Metadata Tests
runner.test('should include scopes in client metadata', () => {
  const scopes = ['read-files', 'write-files', 'execute-tools']
  const provider = new BrowserOAuthClientProvider(serverUrl, { scopes })
  
  const metadata = provider.clientMetadata
  
  expect(metadata.scope).toBe('read-files write-files execute-tools')
  expect(metadata.redirect_uris).toEqual(['https://example.com/oauth/callback'])
  expect(metadata.token_endpoint_auth_method).toBe('none')
  expect(metadata.grant_types).toEqual(['authorization_code', 'refresh_token'])
  expect(metadata.response_types).toEqual(['code'])
})

runner.test('should handle special characters in scopes', () => {
  const scopes = ['file:read', 'web:search', 'db:write']
  const provider = new BrowserOAuthClientProvider(serverUrl, { scopes })
  
  expect(provider.clientMetadata.scope).toBe('file:read web:search db:write')
})

// State Management Tests
runner.test('should store scopes in state during authorization redirect', async () => {
  const scopes = ['file-ops', 'web-search']
  const provider = new BrowserOAuthClientProvider(serverUrl, { scopes })
  
  const authUrl = new URL('https://auth-server.com/oauth/authorize')
  await provider.redirectToAuthorization(authUrl)
  
  // Check that state was stored with scopes
  const stateKey = 'mcp:auth:state_test-uuid-123'
  const storedStateJson = localStorage.getItem(stateKey)
  expect(storedStateJson).toBeTruthy()
  
  const storedState: StoredState = JSON.parse(storedStateJson!)
  expect(storedState.providerOptions.scopes).toEqual(scopes)
})

runner.test('should preserve all provider options including scopes in state', async () => {
  const options = {
    scopes: ['custom-scope-1', 'custom-scope-2'],
    clientName: 'Test Client',
    clientUri: 'https://test.com',
    callbackUrl: 'https://test.com/callback',
    storageKeyPrefix: 'test-prefix'
  }
  
  const provider = new BrowserOAuthClientProvider(serverUrl, options)
  const authUrl = new URL('https://auth-server.com/oauth/authorize')
  await provider.redirectToAuthorization(authUrl)
  
  const stateKey = 'test-prefix:state_test-uuid-123'
  const storedStateJson = localStorage.getItem(stateKey)
  const storedState: StoredState = JSON.parse(storedStateJson!)
  
  expect(storedState.providerOptions.scopes).toEqual(options.scopes)
  expect(storedState.providerOptions.clientName).toBe(options.clientName)
  expect(storedState.providerOptions.serverUrl).toBe(serverUrl)
})

// Backward Compatibility Tests
runner.test('should work with old constructor calls (no scopes)', () => {
  const provider = new BrowserOAuthClientProvider(serverUrl, {
    clientName: 'Legacy Client',
    clientUri: 'https://legacy.com'
  })
  
  expect(provider.scopes).toEqual(['openid'])
  expect(provider.clientMetadata.scope).toBe('openid')
  expect(provider.clientMetadata.client_name).toBe('Legacy Client')
})

runner.test('should maintain existing functionality when scopes are added', () => {
  const provider = new BrowserOAuthClientProvider(serverUrl, { scopes: ['new-scope'] })
  
  // All existing methods should still work
  expect(provider.serverUrl).toBe(serverUrl)
  expect(provider.redirectUrl).toBe('https://example.com/oauth/callback')
  expect(provider.getKey('test')).toMatch(/^mcp:auth_[a-f0-9]+_test$/)
})

// Error Handling Tests
runner.test('should handle undefined scopes gracefully', () => {
  const provider = new BrowserOAuthClientProvider(serverUrl, { 
    scopes: undefined as any 
  })
  
  expect(provider.scopes).toEqual(['openid'])
})

runner.test('should handle scopes with whitespace', () => {
  const scopes = ['  file-ops  ', 'web-search', '  db-access  ']
  const provider = new BrowserOAuthClientProvider(serverUrl, { scopes })
  
  expect(provider.scopes).toEqual(scopes)
  expect(provider.clientMetadata.scope).toBe('  file-ops   web-search   db-access  ')
})

// Storage Tests
runner.test('should clear scope-related state during clearStorage', () => {
  const provider = new BrowserOAuthClientProvider(serverUrl, { scopes: ['test-scope'] })
  
  // Simulate stored state with scopes
  const stateKey = 'mcp:auth:state_test-123'
  const stateData: StoredState = {
    serverUrlHash: provider.serverUrlHash,
    expiry: Date.now() + 60000,
    providerOptions: {
      serverUrl,
      storageKeyPrefix: 'mcp:auth',
      clientName: 'Test Client',
      clientUri: 'https://test.com',
      callbackUrl: 'https://test.com/callback',
      scopes: ['test-scope']
    }
  }
  localStorage.setItem(stateKey, JSON.stringify(stateData))
  
  // Add some regular storage items
  localStorage.setItem(provider.getKey('tokens'), '{"access_token":"test"}')
  localStorage.setItem(provider.getKey('client_info'), '{"client_id":"test"}')
  
  const clearedCount = provider.clearStorage()
  
  expect(clearedCount).toBeGreaterThan(0)
  expect(localStorage.getItem(provider.getKey('tokens'))).toBeNull()
})

// Callback Integration Test
runner.test('should reconstruct provider with correct scopes from stored state', () => {
  const originalScopes = ['file-ops', 'web-search']
  
  // Simulate stored state from authorization
  const storedState: StoredState = {
    serverUrlHash: 'test-hash',
    expiry: Date.now() + 60000,
    providerOptions: {
      serverUrl: 'https://test-server.com',
      storageKeyPrefix: 'test-prefix',
      clientName: 'Test Client',
      clientUri: 'https://test.com',
      callbackUrl: 'https://test.com/callback',
      scopes: originalScopes
    }
  }
  
  // This simulates what happens in the callback
  const { serverUrl, ...providerOptions } = storedState.providerOptions
  const reconstructedProvider = new BrowserOAuthClientProvider(serverUrl, providerOptions)
  
  expect(reconstructedProvider.scopes).toEqual(originalScopes)
  expect(reconstructedProvider.clientMetadata.scope).toBe('file-ops web-search')
})

// Edge Cases
runner.test('should handle many scopes', () => {
  const manyScopes = Array.from({ length: 10 }, (_, i) => `scope-${i}`)
  const provider = new BrowserOAuthClientProvider(serverUrl, { scopes: manyScopes })
  
  expect(provider.scopes).toEqual(manyScopes)
  expect(provider.clientMetadata.scope).toBe(manyScopes.join(' '))
})

runner.test('should handle OAuth standard scopes', () => {
  const oauthScopes = ['openid', 'profile', 'email', 'offline_access']
  const provider = new BrowserOAuthClientProvider(serverUrl, { scopes: oauthScopes })
  
  expect(provider.scopes).toEqual(oauthScopes)
  expect(provider.clientMetadata.scope).toBe('openid profile email offline_access')
})

// Run the tests
console.log('Starting test execution...')
runner.run().then(success => {
  console.log(success ? 'All tests passed!' : 'Some tests failed!')
})