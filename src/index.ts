/**
 * Core entry point for the use-mcp browser library.
 * Provides browser-specific, framework-agnostic components for MCP OAuth.
 */

export { BrowserOAuthClientProvider } from './auth/browser-provider.js'
export { onMcpAuthorization } from './auth/callback.js'

// Optionally re-export relevant types from SDK or internal types if needed
export type { StoredState as InternalStoredState } from './auth/types.js' // Example if needed internally

// It's generally better to have users import SDK types directly from the SDK
// export type { Tool, JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
// export type { OAuthClientInformation, OAuthMetadata, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';
