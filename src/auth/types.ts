import { OAuthMetadata } from '@modelcontextprotocol/sdk/shared/auth.js';

/**
 * Internal type for storing OAuth state in localStorage during the popup flow.
 * @internal
 */
export type StoredState = {
  authorizationUrl: string;
  metadata: OAuthMetadata;
  serverUrlHash: string; // To associate state with a specific server URL
  expiry: number; // Timestamp when the state expires
};