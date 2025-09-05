/**
 * Entry point for the use-mcp Svelte integration.
 * Exposes a Svelte store factory mirroring the React hook contract.
 */

export { createMcp } from './createMcp.js'
export type { UseMcpOptions, UseMcpResult } from '../react/types.js'
export { onMcpAuthorization } from '../auth/callback.js'

// Re-export core types for convenience
export type { Tool, Resource, ResourceTemplate, Prompt } from '@modelcontextprotocol/sdk/types.js'
