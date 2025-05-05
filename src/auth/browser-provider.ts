import { OAuthClientInformation, OAuthMetadata, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';
import { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import { StoredState } from './types.js';

/**
 * Browser-compatible OAuth client provider for MCP using localStorage.
 * Handles storing client information, tokens, and managing the popup/redirect flow.
 */
export class BrowserOAuthClientProvider implements OAuthClientProvider {
  private storageKeyPrefix: string;
  private serverUrlHash: string;
  private clientName: string;
  private clientUri: string;
  private callbackUrl: string;

  /**
   * Creates an instance of BrowserOAuthClientProvider.
   * @param serverUrl The base URL of the MCP server requiring authentication.
   * @param options Configuration options for the provider.
   */
  constructor(
    readonly serverUrl: string,
    options: {
      storageKeyPrefix?: string;
      clientName?: string;
      clientUri?: string;
      callbackUrl?: string;
    } = {},
  ) {
    this.storageKeyPrefix = options.storageKeyPrefix || 'mcp:auth';
    // Hash the server URL to create unique storage keys per server
    this.serverUrlHash = this.hashString(serverUrl);
    this.clientName = options.clientName || 'MCP Browser Client';
    this.clientUri = options.clientUri || window.location.origin;
    // Default callback URL is /oauth/callback on the current origin
    this.callbackUrl = options.callbackUrl || new URL('/oauth/callback', window.location.origin).toString();
  }

  /**
   * The redirect URL used for the OAuth flow.
   */
  get redirectUrl(): string {
    return this.callbackUrl;
  }

  /**
   * Metadata about this client, sent during dynamic client registration (if supported by the server).
   */
  get clientMetadata() {
    return {
      redirect_uris: [this.redirectUrl],
      token_endpoint_auth_method: 'none', // Public client
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      client_name: this.clientName,
      client_uri: this.clientUri,
      // scope: 'openid profile email mcp', // Example scopes, adjust as needed
    };
  }

  /**
   * Clears all localStorage items associated with this specific server URL.
   * @returns The number of items removed from storage.
   */
  clearStorage(): number {
    const prefix = `${this.storageKeyPrefix}_${this.serverUrlHash}`;
    const keysToRemove: string[] = [];

    // Find keys directly related to this server instance
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        keysToRemove.push(key);
      }
    }

    // Also check any persisted OAuth state keys
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(`${this.storageKeyPrefix}:state_`)) {
        try {
          const item = localStorage.getItem(key);
          if (item) {
            const state = JSON.parse(item) as Partial<StoredState>;
            // If state belongs to this server, mark for removal
            if (state.serverUrlHash === this.serverUrlHash) {
              keysToRemove.push(key);
            }
          }
        } catch (e) {
          console.warn(`[${this.storageKeyPrefix}] Error parsing state key ${key}:`, e);
          // Optionally remove malformed keys
          // keysToRemove.push(key);
        }
      }
    }

    // Remove all identified keys
    const uniqueKeysToRemove = [...new Set(keysToRemove)]; // Ensure uniqueness
    uniqueKeysToRemove.forEach(key => localStorage.removeItem(key));

    return uniqueKeysToRemove.length;
  }

  private hashString(str: string): string {
    // Simple, non-cryptographic hash function suitable for creating unique keys
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    // Use absolute value and convert to hex for a cleaner key
    return Math.abs(hash).toString(16);
  }

  private getKey(key: string): string {
    return `${this.storageKeyPrefix}_${this.serverUrlHash}_${key}`;
  }

  /**
   * Retrieves client information (like client_id) from storage.
   * @returns The stored client information, or undefined if not found/invalid.
   */
  async clientInformation(): Promise<OAuthClientInformation | undefined> {
    const key = this.getKey('client_info');
    const data = localStorage.getItem(key);
    if (!data) return undefined;

    try {
      // TODO: Add validation using a schema (e.g., Zod)
      return JSON.parse(data) as OAuthClientInformation;
    } catch (e) {
      console.warn(`[${this.storageKeyPrefix}] Failed to parse client information from storage:`, e);
      localStorage.removeItem(key); // Clean up invalid data
      return undefined;
    }
  }

  /**
   * Saves client information to storage.
   * @param clientInformation The client information to save.
   */
  async saveClientInformation(clientInformation: OAuthClientInformation): Promise<void> {
    const key = this.getKey('client_info');
    localStorage.setItem(key, JSON.stringify(clientInformation));
  }

  /**
   * Retrieves OAuth tokens (access token, refresh token) from storage.
   * @returns The stored tokens, or undefined if not found/invalid.
   */
  async tokens(): Promise<OAuthTokens | undefined> {
    const key = this.getKey('tokens');
    const data = localStorage.getItem(key);
    if (!data) return undefined;

    try {
      // TODO: Add validation using a schema (e.g., Zod)
      const tokens = JSON.parse(data) as OAuthTokens;
      // Optional: Check token expiry here if 'expires_at' is stored
      return tokens;
    } catch (e) {
      console.warn(`[${this.storageKeyPrefix}] Failed to parse tokens from storage:`, e);
      localStorage.removeItem(key); // Clean up invalid data
      return undefined;
    }
  }

  /**
   * Saves OAuth tokens to storage.
   * @param tokens The tokens to save.
   */
  async saveTokens(tokens: OAuthTokens): Promise<void> {
    const key = this.getKey('tokens');
    // Optional: Calculate and store expiry timestamp:
    // const storedTokens = { ...tokens, expires_at: Date.now() + (tokens.expires_in || 0) * 1000 };
    localStorage.setItem(key, JSON.stringify(tokens));
  }

  /**
   * Initiates the OAuth authorization flow by opening a popup window.
   * Stores necessary state in localStorage for the callback handler.
   * @param authorizationUrl The fully constructed authorization URL (including client_id, redirect_uri, scope, code_challenge, etc.).
   * @param metadata The discovered OAuth metadata of the server.
   * @param options Configuration for the popup window.
   * @returns An object indicating success, whether the popup was potentially blocked, and the URL used.
   */
  // @ts-ignore
  async redirectToAuthorization(
    authorizationUrl: URL,
    metadata: OAuthMetadata,
    options?: {
      popupFeatures?: string;
    },
  ): Promise<{ success: boolean; popupBlocked?: boolean; url: string }> {
    // Generate a unique state parameter for this authorization request
    const state = crypto.randomUUID(); // Use crypto.randomUUID for better randomness
    const stateKey = `${this.storageKeyPrefix}:state_${state}`;

    // Store context needed by the callback handler, associated with the state param
    localStorage.setItem(
      stateKey,
      JSON.stringify({
        authorizationUrl: authorizationUrl.origin, // Store origin for exchangeAuthorization
        metadata,
        serverUrlHash: this.serverUrlHash, // Link state back to this server instance
        expiry: Date.now() + 1000 * 60 * 10, // State expires in 10 minutes
      } as StoredState),
    );
    authorizationUrl.searchParams.set('state', state);

    const authUrlString = authorizationUrl.toString();
    const popupFeatures = options?.popupFeatures || 'width=600,height=700,resizable=yes,scrollbars=yes,status=yes';

    // Persist the exact auth URL in case the popup fails and manual navigation is needed
    localStorage.setItem(this.getKey('auth_url'), authUrlString);

    try {
      // Attempt to open the authorization URL in a new window
      const popup = window.open(authUrlString, `mcp_auth_${this.serverUrlHash}`, popupFeatures);

      // Check if the popup window handle was obtained and if it's not immediately closed
      if (!popup || popup.closed || typeof popup.closed === 'undefined') {
        // This is the most common indicator of a popup blocker
        console.warn(`[${this.storageKeyPrefix}] Popup likely blocked by browser.`);
        return { success: false, popupBlocked: true, url: authUrlString };
      }

      // Additional check: try accessing a property that might throw if blocked cross-origin
      // Note: This might not always work due to browser security policies evolution
      try {
        // Accessing location.href will likely throw a cross-origin error immediately
        // if the popup is loading the auth server's domain, which is expected.
        // What we *really* want to detect is if the popup *failed to open at all*.
        // The initial check (!popup || popup.closed) is usually sufficient.
        // Focusing the popup can be a sign it opened successfully.
        popup.focus();
      } catch (e) {
        // If accessing the popup threw an error immediately, it might indicate a deeper issue,
        // but often it's just a standard cross-origin security restriction.
        // The initial check is more reliable for detecting simple blocking.
        console.debug(`[${this.storageKeyPrefix}] Accessing popup properties caused potential cross-origin error (normal):`, e);
      }

      // If we reached here, the popup handle was obtained and wasn't immediately closed.
      return { success: true, url: authUrlString };
    } catch (e) {
      // Catch any unexpected errors during window.open
      console.error(`[${this.storageKeyPrefix}] Error opening popup window:`, e);
      return { success: false, popupBlocked: true, url: authUrlString }; // Assume blocked on error
    }
  }

  /**
   * Saves the PKCE code verifier to storage.
   * @param codeVerifier The code verifier string.
   */
  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    const key = this.getKey('code_verifier');
    localStorage.setItem(key, codeVerifier);
  }

  /**
   * Retrieves the PKCE code verifier from storage.
   * @returns The stored code verifier.
   * @throws If the code verifier is not found in storage.
   */
  async codeVerifier(): Promise<string> {
    const key = this.getKey('code_verifier');
    const verifier = localStorage.getItem(key);
    if (!verifier) {
      throw new Error(`[${this.storageKeyPrefix}] Code verifier not found in storage for key ${key}. Auth flow likely corrupted or timed out.`);
    }
    // Optionally remove the verifier after retrieving it, as it's single-use
    // localStorage.removeItem(key);
    return verifier;
  }
}
