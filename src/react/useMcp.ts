import { CallToolResultSchema, JSONRPCMessage, ListToolsResultSchema, Tool } from '@modelcontextprotocol/sdk/types.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { discoverOAuthMetadata, exchangeAuthorization, startAuthorization, UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js';
import { OAuthClientInformation, OAuthMetadata, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';
import { BrowserOAuthClientProvider } from '../auth/browser-provider.js';
import { assert } from '../utils/assert.js';
import type { UseMcpOptions, UseMcpResult } from './types.js';

const DEFAULT_RECONNECT_DELAY = 3000;
const DEFAULT_RETRY_DELAY = 5000;
const AUTH_TIMEOUT = 5 * 60 * 1000; // 5 minutes for user to complete auth in popup

/**
 * React hook to connect to a remote MCP server, handle OAuth authentication,
 * and provide access to server-side tools for use with AI SDKs.
 *
 * @param options Configuration options for connecting to the MCP server.
 * @returns State and functions for interacting with the MCP connection.
 */
export function useMcp(options: UseMcpOptions): UseMcpResult {
  const {
    url,
    clientName, // Passed to BrowserOAuthClientProvider
    clientUri, // Passed to BrowserOAuthClientProvider
    callbackUrl = typeof window !== 'undefined' ? new URL('/oauth/callback', window.location.origin).toString() : '/oauth/callback',
    storageKeyPrefix = 'mcp:auth',
    clientConfig = {},
    debug = false,
    autoRetry = false,
    autoReconnect = DEFAULT_RECONNECT_DELAY,
    popupFeatures = 'width=600,height=700,resizable=yes,scrollbars=yes,status=yes',
  } = options;

  const [state, setState] = useState<UseMcpResult['state']>('discovering');
  const [tools, setTools] = useState<Tool[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);
  const [log, setLog] = useState<UseMcpResult['log']>([]);
  const [authUrl, setAuthUrl] = useState<string | undefined>(undefined); // For manual auth if popup blocked

  const clientRef = useRef<Client | null>(null);
  const transportRef = useRef<SSEClientTransport | null>(null);
  const authProviderRef = useRef<BrowserOAuthClientProvider | null>(null);
  const metadataRef = useRef<OAuthMetadata | undefined>(undefined);
  const pendingAuthUrlRef = useRef<URL | undefined>(undefined); // Stores the URL while waiting for popup
  const connectingRef = useRef<boolean>(false); // Prevent concurrent connection attempts
  const isMountedRef = useRef<boolean>(true); // Track component mount status
  const connectAttemptRef = useRef<number>(0); // Track connection attempts for retry logic
  const authTimeoutRef = useRef<number | null>(null); // Timer for auth popup

  // ===== Logging Utility =====

  const addLog = useCallback(
    (level: UseMcpResult['log'][0]['level'], message: string, ...args: unknown[]) => {
      // if (level === 'debug' && !debug) return;

      const fullMessage = args.length > 0 ? `${message} ${args.map(arg => JSON.stringify(arg)).join(' ')}` : message;
      console[level](`[useMcp] ${fullMessage}`);
      if (isMountedRef.current) {
        setLog((prevLog) => [...prevLog, { level, message: fullMessage, timestamp: Date.now() }]);
      }
    },
    [debug, isMountedRef],
  );

  // ===== Core Actions =====

  const disconnect = useCallback(
    async (quiet = false) => {
      if (!quiet) addLog('info', 'Disconnecting...');
      connectingRef.current = false;
      clearTimeout(authTimeoutRef.current!);
      authTimeoutRef.current = null;

      const client = clientRef.current;
      const transport = transportRef.current;
      clientRef.current = null;
      transportRef.current = null;

      // Don't reset state if unmounting
      if (isMountedRef.current && !quiet) {
        setState('discovering'); // Or 'disconnected'? Let's stick to initial flow for retry.
        setTools([]);
        setError(undefined);
        setAuthUrl(undefined);
        pendingAuthUrlRef.current = undefined;
      }

      // Close transport first, then client
      if (transport) {
        try {
          await transport.close();
          if (!quiet) addLog('debug', 'Transport closed');
        } catch (err) {
          if (!quiet) addLog('warn', 'Error closing transport:', err);
        }
      }
      // Note: Client doesn't have an explicit async close, it relies on transport.
    },
    [addLog],
  );

  const failConnection = useCallback((errorMessage: string, connectionError?: Error) => {
    addLog('error', errorMessage, connectionError ?? '');
    if (isMountedRef.current) {
      setState('failed');
      setError(errorMessage);
    }
    connectingRef.current = false;
    disconnect(true); // Quiet disconnect
  }, [addLog, disconnect]);


  // ===== Authentication Flow =====

  const initiateAuthFlow = useCallback(async (): Promise<URL | undefined> => {
    assert(authProviderRef.current, 'Auth provider not initialized');
    assert(metadataRef.current, 'OAuth metadata not discovered');
    addLog('info', 'Initiating OAuth authorization flow...');

    try {
      // Dynamic Client Registration (DCR) - Placeholder
      // In a real browser scenario, DCR is complex. Often, a pre-registered
      // client_id is used. If DCR is needed, it typically involves a backend proxy.
      let clientInfo = await authProviderRef.current.clientInformation();
      if (!clientInfo) {
        // Assuming pre-registration or manual setup for browser clients
        // If DCR were implemented:
        // addLog('info', 'No client info found, attempting dynamic registration...');
        // clientInfo = await registerClient(url, authProviderRef.current.clientMetadata);
        // await authProviderRef.current.saveClientInformation(clientInfo);
        // addLog('info', 'Client registration successful');

        // For now, error if no client_id is found (must be pre-configured or manually stored)
        addLog('warn', 'Client information not found in storage. Authentication requires a pre-registered client_id.');
        throw new Error('Client information (client_id) not found. Please ensure the client is registered with the auth server and the details are stored, or implement dynamic registration.');
      }

      addLog('debug', 'Using client information:', clientInfo);

      const { authorizationUrl, codeVerifier } = await startAuthorization(url, {
        metadata: metadataRef.current,
        clientInformation: clientInfo,
        redirectUrl: authProviderRef.current.redirectUrl,
        // scopes: ['openid', 'profile', 'mcp'], // Optional: Request specific scopes
      });

      addLog('debug', 'Authorization URL created:', authorizationUrl.toString());
      await authProviderRef.current.saveCodeVerifier(codeVerifier);
      addLog('debug', 'Code verifier saved.');

      pendingAuthUrlRef.current = authorizationUrl; // Store for popup opening
      setAuthUrl(authorizationUrl.toString()); // Expose for manual fallback

      return authorizationUrl;

    } catch (err) {
      failConnection(`Failed to start OAuth authorization: ${err instanceof Error ? err.message : String(err)}`, err instanceof Error ? err : undefined);
      return undefined;
    }

  }, [url, addLog, failConnection]);

  const openAuthPopup = useCallback(async () => {
    assert(authProviderRef.current, 'Auth provider not available');
    assert(metadataRef.current, 'Metadata not available');

    let authPopupUrl = pendingAuthUrlRef.current;

    // If URL isn't already generated, try generating it now
    if (!authPopupUrl) {
      addLog('info', 'Auth URL not pre-generated, initiating flow now...');
      authPopupUrl = await initiateAuthFlow();
      if (!authPopupUrl) {
        // initiateAuthFlow calls failConnection on error
        return undefined;
      }
    }

    addLog('info', 'Attempting to open authentication popup...');
    setState('authenticating'); // Update state *before* opening popup

    const redirectResult = await authProviderRef.current.redirectToAuthorization(
      authPopupUrl,
      metadataRef.current,
      { popupFeatures },
    );

    if (redirectResult.success) {
      addLog('info', 'Authentication popup opened. Waiting for user action...');
      // Start timeout for auth completion
      clearTimeout(authTimeoutRef.current!);
      authTimeoutRef.current = setTimeout(() => {
        addLog('warn', 'Authentication timed out.');
        if (isMountedRef.current && state === 'authenticating') {
          failConnection('Authentication timed out. Please try again.');
        }
      }, AUTH_TIMEOUT);
    } else {
      addLog('warn', 'Authentication popup was blocked or failed to open.');
      setAuthUrl(redirectResult.url); // Ensure the manual URL is available
      failConnection(
        'Authentication popup blocked. Please allow popups for this site or use the provided link to authenticate manually.',
        new Error('PopupBlocked') // Custom error?
      );
      // Do not clear pendingAuthUrlRef here, retry might need it
    }
    return redirectResult.url;

  }, [addLog, failConnection, initiateAuthFlow, popupFeatures, state]);


  // ===== Connection Logic =====

  const connect = useCallback(async () => {
    if (connectingRef.current) {
      addLog('debug', 'Connection attempt already in progress, skipping.');
      return;
    }
    if (!isMountedRef.current) return; // Don't connect if unmounted

    connectingRef.current = true;
    connectAttemptRef.current += 1;
    setError(undefined);
    setAuthUrl(undefined);
    pendingAuthUrlRef.current = undefined;
    setState('discovering');
    addLog('info', `Connecting attempt #${connectAttemptRef.current}...`);

    // 1. Initialize Auth Provider
    if (!authProviderRef.current) {
      authProviderRef.current = new BrowserOAuthClientProvider(url, {
        storageKeyPrefix,
        clientName,
        clientUri,
        callbackUrl,
      });
      addLog('debug', 'BrowserOAuthClientProvider initialized.');
    }

    // 2. Initialize MCP Client
    if (!clientRef.current) {
      clientRef.current = new Client(
        {
          name: clientConfig.name || 'use-mcp-react-client',
          version: clientConfig.version || '0.1.0', // TODO: Get version from package.json?
        },
        { capabilities: { /* Define client caps if any */ } },
      );
      addLog('debug', 'MCP Client initialized.');
    }

    // 3. Create SSE Transport
    addLog('info', 'Creating SSE transport...');
    setState('connecting');
    const serverUrl = new URL(url); // Ensure it's a URL object

    // Clear previous transport if any
    if (transportRef.current) {
      await transportRef.current.close().catch(e => addLog('warn', 'Error closing previous transport:', e));
    }

    transportRef.current = new SSEClientTransport(serverUrl, {
      // @ts-ignore
      authProvider: authProviderRef.current,
      // Pass debug flag to transport if it supports it
    });
    addLog('debug', 'SSEClientTransport created.');

    // 4. Set up Transport Handlers
    transportRef.current.onmessage = (message: JSONRPCMessage) => {
      // @ts-expect-error - SDK type might be union, check message content
      addLog('debug', `[Transport] Received message: Method=${message.method || 'N/A'} ID=${message.id || 'N/A'}`);
      // Forward notifications/responses to the client instance
      // @ts-ignore
      clientRef.current?.handleMessage(message);
    };

    transportRef.current.onerror = (err: Error) => {
      // Check if the error indicates an auth issue *before* full connection
      if (err instanceof UnauthorizedError || err.message.includes('Unauthorized') || err.message.includes('401')) {
        addLog('warn', 'Transport connection requires authentication.');
        // Don't immediately fail, proceed to connect step which handles auth discovery
      } else {
        // Handle other transport-level errors (network issues, etc.)
        failConnection(`Transport error: ${err.message}`, err);
      }
    };

    transportRef.current.onclose = () => {
      // Only handle close if we weren't explicitly disconnecting or failing
      if (connectingRef.current || !isMountedRef.current) return;

      addLog('info', 'Transport connection closed.');
      if (state === 'ready' && autoReconnect) {
        const delay = typeof autoReconnect === 'number' ? autoReconnect : DEFAULT_RECONNECT_DELAY;
        addLog('info', `Attempting to reconnect in ${delay}ms...`);
        setTimeout(() => {
          // Perform a clean disconnect before reconnecting
          disconnect().then(() => {
            if (isMountedRef.current) connect();
          });
        }, delay);
        // Set state to indicate reconnection attempt? Maybe 'connecting'?
        if (isMountedRef.current) setState('connecting');
      } else if (state !== 'failed') {
        // If not ready or autoReconnect is off, treat unexpected close as failure
        failConnection('Connection closed unexpectedly.');
      }
    };

    // 5. Connect Client (which starts the transport internally)
    try {
      addLog('info', 'Connecting client...');
      assert(clientRef.current, "Client not initialized");
      assert(transportRef.current, "Transport not initialized");

      // The client.connect() method internally calls transport.start()
      await clientRef.current.connect(transportRef.current);

      // If connect resolves without error, we are connected (potentially anonymously)
      addLog('info', 'Client connected successfully.');
      setState('loading'); // Move to loading state

      // 6. Load Tools
      try {
        addLog('info', 'Loading tools...');
        const toolsResponse = await clientRef.current.request({ method: 'tools/list' }, ListToolsResultSchema);
        if (isMountedRef.current) {
          setTools(toolsResponse.tools);
          addLog('info', `Loaded ${toolsResponse.tools.length} tools.`);
          setState('ready'); // Final success state
          connectingRef.current = false;
          connectAttemptRef.current = 0; // Reset attempt counter on success
        }
      } catch (toolErr) {
        // If loading tools fails, we are still connected but log the error.
        addLog('error', `Failed to load tools: ${toolErr instanceof Error ? toolErr.message : String(toolErr)}`);
        // Consider if this should be a 'failed' state or just 'ready' with no tools
        if (isMountedRef.current) {
          setState('ready'); // Stay ready, but tools array is empty/stale
          setTools([]); // Ensure tools are empty on error
        }
        connectingRef.current = false; // Still finish connection attempt
      }

    } catch (connectErr) {
      // Handle errors during the client.connect() phase
      addLog('debug', 'Client connect error:', connectErr);

      if (connectErr instanceof UnauthorizedError || (connectErr instanceof Error && (connectErr.message.includes('Unauthorized') || connectErr.message.includes('401')))) {
        addLog('info', 'Authentication required.');

        // Discover OAuth metadata
        if (!metadataRef.current) {
          try {
            addLog('info', 'Discovering OAuth metadata...');
            metadataRef.current = await discoverOAuthMetadata(url);
            assert(metadataRef.current, 'Server does not provide OAuth metadata.');
            addLog('info', 'OAuth metadata discovered:', metadataRef.current);
          } catch (discoverErr) {
            failConnection(`Failed to discover OAuth metadata: ${discoverErr instanceof Error ? discoverErr.message : String(discoverErr)}`, discoverErr instanceof Error ? discoverErr : undefined);
            return; // Stop connection process
          }
        }

        // We have metadata, attempt to open the popup
        await openAuthPopup(); // This sets state to 'authenticating' or 'failed'

      } else {
        // Handle other connection errors (network, server unavailable, etc.)
        failConnection(`Failed to connect: ${connectErr instanceof Error ? connectErr.message : String(connectErr)}`, connectErr instanceof Error ? connectErr : undefined);
      }
    }
    // Note: connectingRef is set to false within success/failure paths above or in openAuthPopup's failConnection.

  }, [
    url, storageKeyPrefix, clientName, clientUri, callbackUrl, clientConfig,
    addLog, failConnection, disconnect, state, autoReconnect, openAuthPopup,
    // Explicitly list dependencies that should trigger re-connect if changed:
    // url, storageKeyPrefix, callbackUrl, clientConfig.name, clientConfig.version (?),
  ]);


  // ===== Public API Methods =====

  const callTool = useCallback(
    async (name: string, args?: Record<string, unknown>) => {
      if (state !== 'ready' || !clientRef.current) {
        throw new Error(`MCP client is not ready (current state: ${state}). Cannot call tool "${name}".`);
      }
      addLog('info', `Calling tool: ${name}`, args);
      try {
        const result = await clientRef.current.request(
          {
            method: 'tools/call',
            params: { name, arguments: args },
          },
          CallToolResultSchema, // Optional: Validate result against schema
        );
        addLog('info', `Tool "${name}" call successful.`);
        return result.result; // Assuming CallToolResultSchema has a `result` field
      } catch (err) {
        addLog('error', `Error calling tool "${name}": ${err instanceof Error ? err.message : String(err)}`);
        // TODO: Should specific JSON-RPC errors be handled differently?
        throw err; // Re-throw the error
      }
    },
    [state, addLog],
  );

  const retry = useCallback(() => {
    if (state === 'failed') {
      addLog('info', 'Manual retry requested...');
      // Reset attempt counter? Or let connect handle it? Let connect handle it.
      disconnect().then(() => {
        if (isMountedRef.current) connect();
      });
    } else {
      addLog('warn', `Retry called but state is not 'failed' (state: ${state}). Ignoring.`);
    }
  }, [state, addLog, disconnect, connect]);

  const authenticate = useCallback(async (): Promise<string | undefined> => {
    addLog('info', 'Manual authentication requested...');
    if (state === 'failed' && error?.includes('popup blocked')) {
      // If we failed due to popup blocking, try opening the popup again
      return openAuthPopup();
    } else if (!metadataRef.current && (state === 'failed' || state === 'discovering')) {
      // If we failed before discovering metadata, try full connect again
      addLog('info', 'Metadata not yet discovered, attempting full reconnect...');
      await disconnect();
      if (isMountedRef.current) await connect(); // connect will handle auth discovery
      // We don't know the auth URL yet in this case
      return undefined;
    } else if (metadataRef.current) {
      // If we have metadata, try opening popup directly
      return openAuthPopup();
    } else {
      addLog('warn', 'Cannot manually authenticate in current state:', state);
      return undefined;
    }
  }, [state, error, addLog, openAuthPopup, disconnect, connect]);


  const clearStorage = useCallback(() => {
    if (authProviderRef.current) {
      const count = authProviderRef.current.clearStorage();
      addLog('info', `Cleared ${count} item(s) from localStorage for ${url}.`);
      // Also clear related state in the hook
      metadataRef.current = undefined;
      pendingAuthUrlRef.current = undefined;
      setAuthUrl(undefined);
      // Consider if a disconnect/reconnect is needed after clearing storage
      addLog('info', 'Storage cleared. Recommend disconnecting and reconnecting if currently connected.');
      disconnect(); // Force disconnect as auth state is gone
    } else {
      addLog('warn', 'Auth provider not initialized, cannot clear storage.');
      // Attempt to clear based on prefix/hash anyway? Risky.
      // For safety, only clear if provider exists.
    }
  }, [addLog, url, disconnect]);


  // ===== Effects =====

  // Effect for handling auth callback messages from popup
  useEffect(() => {
    const messageHandler = (event: MessageEvent) => {
      // Security: Check origin
      if (event.origin !== window.location.origin) {
        addLog('debug', `Ignoring message from different origin: ${event.origin}`);
        return;
      }

      if (event.data && event.data.type === 'mcp_auth_callback') {
        addLog('info', 'Received auth callback message from popup window.', event.data);
        clearTimeout(authTimeoutRef.current!); // Stop the auth timeout

        // Check if the message corresponds to this hook instance if multiple hooks might exist
        // (Requires serverUrlHash to be passed back in message data from callback handler)
        // const currentHash = authProviderRef.current?.serverUrlHash; // Need to expose serverUrlHash or compare URL
        // if (currentHash && event.data.serverUrlHash && currentHash !== event.data.serverUrlHash) {
        //   addLog('debug', 'Ignoring auth callback for different server instance.');
        //   return;
        // }

        if (event.data.success) {
          addLog('info', 'Authentication successful via popup. Reconnecting...');
          // The callback saved the token. Disconnect and reconnect to use it.
          disconnect().then(() => {
            if (isMountedRef.current) connect();
          });
        } else {
          // Auth failed in the popup/callback handler
          failConnection(`Authentication failed: ${event.data.error || 'Unknown reason.'}`);
        }
      }
    };

    window.addEventListener('message', messageHandler);
    addLog('debug', 'Auth callback message listener added.');

    return () => {
      window.removeEventListener('message', messageHandler);
      addLog('debug', 'Auth callback message listener removed.');
      clearTimeout(authTimeoutRef.current!);
    };
  }, [addLog, failConnection, disconnect, connect]); // Dependencies: functions that handle success/failure

  // Effect for initial connection and auto-retry
  useEffect(() => {
    // Store mount status
    isMountedRef.current = true;
    addLog('debug', 'Component mounted, initiating connection.');
    connectAttemptRef.current = 0; // Reset attempts on mount/URL change
    connect(); // Initial connection attempt

    // Cleanup on unmount
    return () => {
      isMountedRef.current = false;
      addLog('debug', 'Component unmounting, disconnecting.');
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    // Reconnect if these core config options change
    url,
    storageKeyPrefix,
    callbackUrl,
    // clientName, clientUri? Only if DCR is used.
    // clientConfig.name, clientConfig.version? Usually stable.
    // connect, disconnect // connect/disconnect functions are stable due to useCallback
  ]);

  // Effect for auto-retry logic
  useEffect(() => {
    let retryTimeoutId: number | null = null;
    if (state === 'failed' && autoRetry && connectAttemptRef.current > 0) {
      // Only retry if the *initial* connection or subsequent retries failed
      const delay = typeof autoRetry === 'number' ? autoRetry : DEFAULT_RETRY_DELAY;
      addLog('info', `Connection failed, auto-retrying in ${delay}ms...`);
      retryTimeoutId = setTimeout(() => {
        if (isMountedRef.current && state === 'failed') { // Check state again before retrying
          retry();
        }
      }, delay);
    }

    return () => {
      if (retryTimeoutId) {
        clearTimeout(retryTimeoutId);
      }
    };
  }, [state, autoRetry, retry, addLog]); // Depends on state and retry config


  // Return the public API
  return {
    state,
    tools,
    error,
    log,
    authUrl,
    callTool,
    retry,
    disconnect,
    authenticate,
    clearStorage,
  };
}
