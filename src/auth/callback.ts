import { exchangeAuthorization } from '@modelcontextprotocol/sdk/client/auth.js';
import { OAuthClientInformation, OAuthMetadata } from '@modelcontextprotocol/sdk/shared/auth.js';
import { StoredState } from './types.js';

/**
 * Handles the OAuth callback. This function should be invoked on your callback page
 * (e.g., /oauth/callback) with the URL query parameters.
 *
 * It validates the state parameter, retrieves stored context from localStorage,
 * exchanges the authorization code for tokens using the stored code verifier,
 * saves the tokens, and notifies the opener window.
 *
 * @param query The URL query parameters (e.g., from `window.location.search`).
 * @param options Configuration options.
 * @param options.storageKeyPrefix The prefix used for localStorage keys (must match the one used by `BrowserOAuthClientProvider`). Defaults to "mcp:auth".
 * @returns An object indicating success or failure with an error message.
 */
export async function onMcpAuthorization(
  query: Record<string, string>,
  {
    storageKeyPrefix = 'mcp:auth',
  }: {
    storageKeyPrefix?: string;
  } = {},
): Promise<{ success: boolean; error?: string }> {
  const logPrefix = `[${storageKeyPrefix}-callback]`;
  console.log(`${logPrefix} Handling OAuth callback with query:`, query);

  try {
    const code = query.code;
    const state = query.state;
    const error = query.error;
    const errorDescription = query.error_description;

    if (error) {
      throw new Error(`OAuth error: ${error} - ${errorDescription || 'No description provided.'}`);
    }

    if (!code) {
      throw new Error('Authorization code not found in callback query parameters.');
    }
    if (!state) {
      throw new Error('State parameter not found in callback query parameters.');
    }

    // Retrieve the stored state using the state parameter from the query
    const stateKey = `${storageKeyPrefix}:state_${state}`;
    const storedStateJSON = localStorage.getItem(stateKey);

    if (!storedStateJSON) {
      throw new Error(`Invalid or expired state parameter "${state}". No matching state found in storage.`);
    }

    let storedState: StoredState;
    try {
      storedState = JSON.parse(storedStateJSON);
    } catch (e) {
      throw new Error('Failed to parse stored OAuth state.');
    }

    // Validate expiry
    if (storedState.expiry < Date.now()) {
      throw new Error('OAuth state has expired. Please try initiating authentication again.');
    }

    const { authorizationUrl, serverUrlHash, metadata } = storedState;
    console.log(`${logPrefix} Found valid state for server hash: ${serverUrlHash}`);

    // Construct keys to retrieve client info and code verifier for this server instance
    const clientInfoKey = `${storageKeyPrefix}_${serverUrlHash}_client_info`;
    const codeVerifierKey = `${storageKeyPrefix}_${serverUrlHash}_code_verifier`;
    const tokensKey = `${storageKeyPrefix}_${serverUrlHash}_tokens`;
    const authUrlKey = `${storageKeyPrefix}_${serverUrlHash}_auth_url`; // Key for the potentially stored manual auth URL

    const clientInfoStr = localStorage.getItem(clientInfoKey);
    const codeVerifier = localStorage.getItem(codeVerifierKey);

    if (!clientInfoStr) {
      throw new Error(`Client information not found in storage (key: ${clientInfoKey}).`);
    }
    if (!codeVerifier) {
      throw new Error(`Code verifier not found in storage (key: ${codeVerifierKey}). Auth flow may be incomplete or timed out.`);
    }

    let clientInfo: OAuthClientInformation;
    try {
      clientInfo = JSON.parse(clientInfoStr);
    } catch (e) {
      throw new Error('Failed to parse stored client information.');
    }

    console.log(`${logPrefix} Exchanging authorization code for token...`);

    // Exchange the code for tokens
    const tokens = await exchangeAuthorization(new URL(metadata.token_endpoint), {
      // Use token_endpoint from metadata
      metadata,
      clientInformation: clientInfo,
      authorizationCode: code,
      codeVerifier,
      // redirectUrl is typically required by the token endpoint for verification
      // @ts-ignore
      redirectUrl: new URL('/oauth/callback', window.location.origin).toString(), // TODO: Make this configurable or get from provider instance?
    });

    console.log(`${logPrefix} Token exchange successful. Saving tokens...`);

    // Save the obtained tokens
    localStorage.setItem(tokensKey, JSON.stringify(tokens));

    // Clean up the persisted manual auth URL if it exists
    localStorage.removeItem(authUrlKey);
    // Remove the state key immediately after retrieval (it's single-use)
    localStorage.removeItem(stateKey);
    // Remove the code verifier after retrieving it
    localStorage.removeItem(codeVerifierKey);

    console.log(`${logPrefix} Tokens saved. Notifying opener window.`);

    // Notify the original window (opener) that authentication succeeded
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(
        {
          type: 'mcp_auth_callback',
          success: true,
          // Optionally pass serverUrlHash if multiple hooks might be listening
          serverUrlHash: serverUrlHash,
        },
        window.location.origin, // Target origin must match the opener's origin
      );
      // Close the popup window
      window.close();
    } else {
      // If there's no opener, this might be a full page redirect flow.
      // Redirect back to the app's main page or a specific post-auth page.
      console.warn(`${logPrefix} No opener window detected. Assuming redirect flow. Redirecting to root.`);
      window.location.href = '/'; // Adjust as needed
    }

    return { success: true };
  } catch (err) {
    console.error(`${logPrefix} Error during OAuth callback handling:`, err);
    const errorMessage = err instanceof Error ? err.message : String(err);

    // Attempt to notify the opener window about the failure
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(
        {
          type: 'mcp_auth_callback',
          success: false,
          error: errorMessage,
          // Optionally pass serverUrlHash
          // serverUrlHash: storedState?.serverUrlHash // Might not be available if state parsing failed
        },
        window.location.origin,
      );
    }

    // Display error in the callback window itself for better debugging
    try {
      document.body.innerHTML = `
        <div style="font-family: sans-serif; padding: 20px;">
          <h1>Authentication Error</h1>
          <p style="color: red; background-color: #ffebeb; border: 1px solid red; padding: 10px; border-radius: 4px;">
            ${errorMessage}
          </p>
          <p>You can close this window.</p>
          <pre style="font-size: 0.8em; color: #555; margin-top: 20px; white-space: pre-wrap;">${
        err instanceof Error ? err.stack : ''
      }</pre>
        </div>
      `;
    } catch (displayError) {
      // Fallback if document.body is not available or writable
      console.error(`${logPrefix} Could not display error in callback window:`, displayError);
    }

    return { success: false, error: errorMessage };
  }
}