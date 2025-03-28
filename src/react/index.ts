/**
 * Entry point for the use-mcp React integration.
 * Provides the useMcp hook and related types.
 */

export { useMcp } from './useMcp.js';
export type { UseMcpOptions, UseMcpResult } from './types.js';

// Re-export core Tool type for convenience when using hook result?
export type { Tool } from '@modelcontextprotocol/sdk/types.js';