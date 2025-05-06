// useMcp.ts
import { CallToolResultSchema, JSONRPCMessage, ListToolsResultSchema, Tool } from '@modelcontextprotocol/sdk/types.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { auth, UnauthorizedError, OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import { BrowserOAuthClientProvider } from '../auth/browser-provider.js'; // Adjust path
import { assert } from '../utils/assert.js'; // Adjust path
import type { UseMcpOptions, UseMcpResult } from './types.js'; // Adjust path

const DEFAULT_RECONNECT_DELAY = 3000;
const DEFAULT_RETRY_DELAY = 5000;
const AUTH_TIMEOUT = 5 * 60 * 1000;

export function useMcp(options: UseMcpOptions): UseMcpResult {
  const {
    url,
    clientName,
    clientUri,
    callbackUrl = typeof window !== 'undefined' ? new URL('/oauth/callback', window.location.origin).toString() : '/oauth/callback',
    storageKeyPrefix = 'mcp:auth',
    clientConfig = {},
    debug = false, // Consider using this in addLog
    autoRetry = false,
    autoReconnect = DEFAULT_RECONNECT_DELAY,
  } = options;

  const [state, setState] = useState<UseMcpResult['state']>('discovering');
  const [tools, setTools] = useState<Tool[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);
  const [log, setLog] = useState<UseMcpResult['log']>([]);
  const [authUrl, setAuthUrl] = useState<string | undefined>(undefined);

  const clientRef = useRef<Client | null>(null);
  const transportRef = useRef<SSEClientTransport | null>(null);
  const authProviderRef = useRef<BrowserOAuthClientProvider | null>(null);
  const connectingRef = useRef<boolean>(false);
  const isMountedRef = useRef<boolean>(true);
  const connectAttemptRef = useRef<number>(0);
  const authTimeoutRef = useRef<number | null>(null);

  // --- Refs for values used in callbacks ---
  // Ref to hold the latest state value for use in callbacks without causing dependency changes
  const stateRef = useRef(state);
  // Ref to hold autoReconnect option
  const autoReconnectRef = useRef(autoReconnect);

  // --- Effect to keep refs updated ---
  useEffect(() => {
    stateRef.current = state;
    autoReconnectRef.current = autoReconnect;
  }, [state, autoReconnect]);

  // --- Stable Callbacks ---
  // addLog is stable (empty dependency array)
  const addLog = useCallback(
    (level: UseMcpResult['log'][0]['level'], message: string, ...args: unknown[]) => {
      // if (level === 'debug' && !debug) return; // Uncomment if using debug flag
      const fullMessage = args.length > 0 ? `${message} ${args.map(arg => JSON.stringify(arg)).join(' ')}` : message;
      console[level](`[useMcp] ${fullMessage}`);
      // Use isMountedRef to prevent state updates after unmount
      if (isMountedRef.current) {
        setLog((prevLog) => [...prevLog.slice(-100), { level, message: fullMessage, timestamp: Date.now() }]);
      }
    },
    [], // Empty dependency array makes this stable
  );

  // disconnect is stable (depends only on stable addLog)
  const disconnect = useCallback(
    async (quiet = false) => {
      if (!quiet) addLog('info', 'Disconnecting...');
      connectingRef.current = false;
      if (authTimeoutRef.current) clearTimeout(authTimeoutRef.current);
      authTimeoutRef.current = null;

      const transport = transportRef.current;
      clientRef.current = null; // Ensure client is cleared
      transportRef.current = null; // Ensure transport is cleared

      // Only reset state if mounted and not a quiet disconnect
      if (isMountedRef.current && !quiet) {
        setState('discovering');
        setTools([]);
        setError(undefined);
        setAuthUrl(undefined);
      }

      if (transport) {
        try {
          await transport.close();
          if (!quiet) addLog('debug', 'Transport closed');
        } catch (err) {
          if (!quiet) addLog('warn', 'Error closing transport:', err);
        }
      }
    },
    [addLog], // Depends only on stable addLog
  );

  // failConnection is stable (depends only on stable addLog)
  const failConnection = useCallback((errorMessage: string, connectionError?: Error) => {
    addLog('error', errorMessage, connectionError ?? '');
    if (isMountedRef.current) {
      setState('failed'); // Set state to failed
      setError(errorMessage);
      const manualUrl = authProviderRef.current?.getLastAttemptedAuthUrl();
      if (manualUrl) {
        setAuthUrl(manualUrl);
        addLog('info', 'Manual authentication URL may be available.', manualUrl);
      }
    }
    connectingRef.current = false; // Ensure connection attempt is marked as finished
    // Do not call disconnect here - allow user to see error and retry
  }, [addLog]); // Depends only on stable addLog


  // connect needs to be stable. Remove state/autoReconnect deps, use refs inside.
  const connect = useCallback(async () => {
    if (connectingRef.current) {
      addLog('debug', 'Connection attempt already in progress.');
      return;
    }
    // Check mounted status *before* starting async logic
    if (!isMountedRef.current) {
      addLog('debug', 'Connect called after unmount, aborting.');
      return;
    }

    connectingRef.current = true;
    connectAttemptRef.current += 1;
    setError(undefined);
    setAuthUrl(undefined);
    setState('discovering'); // Set state *before* async calls
    addLog('info', `Connecting attempt #${connectAttemptRef.current} to ${url}...`);

    // Ensure provider/client are initialized (idempotent check)
    if (!authProviderRef.current) {
      authProviderRef.current = new BrowserOAuthClientProvider(url, {
        storageKeyPrefix, clientName, clientUri, callbackUrl
      });
      addLog('debug', 'BrowserOAuthClientProvider initialized in connect.');
    }
    if (!clientRef.current) {
      clientRef.current = new Client(
        { name: clientConfig.name || 'use-mcp-react-client', version: clientConfig.version || '0.1.0' },
        { capabilities: {} },
      );
      addLog('debug', 'MCP Client initialized in connect.');
    }

    // Recreate transport
    setState('connecting'); // Update state
    if (transportRef.current) {
      await transportRef.current.close().catch(e => addLog('warn', 'Error closing previous transport:', e));
      transportRef.current = null;
    }
    try {
      // Assert provider/client are definitely created now
      assert(authProviderRef.current, "Auth Provider must be initialized");
      assert(clientRef.current, "Client must be initialized");

      transportRef.current = new SSEClientTransport(new URL(url), {
        authProvider: authProviderRef.current,
      });
      addLog('debug', 'SSEClientTransport created.');
    } catch(err) {
      failConnection(`Failed to create transport: ${err instanceof Error ? err.message : String(err)}`, err instanceof Error ? err : undefined);
      // connectingRef is set to false inside failConnection
      return; // Stop execution
    }

    // --- Transport Handlers ---
    // These handlers are defined inline within connect's scope.
    // They will implicitly capture the *current* stable callbacks like addLog, failConnection.
    // They use refs (stateRef, autoReconnectRef) to access current state/options when needed.
    transportRef.current.onmessage = (message: JSONRPCMessage) => {
      addLog('debug', `[Transport] Received: ${JSON.stringify(message)}`);
      // Forward to the *current* client instance
      // @ts-ignore
      clientRef.current?.handleMessage(message);
    };
    transportRef.current.onerror = (err: Error) => {
      failConnection(`Transport error: ${err.message}`, err);
    };
    transportRef.current.onclose = () => {
      // Use refs to check state and options without needing them as dependencies
      if (!isMountedRef.current || connectingRef.current) return;

      addLog('info', 'Transport connection closed.');
      const currentState = stateRef.current; // Use ref
      const currentAutoReconnect = autoReconnectRef.current; // Use ref

      if (currentState === 'ready' && currentAutoReconnect) {
        const delay = typeof currentAutoReconnect === 'number' ? currentAutoReconnect : DEFAULT_RECONNECT_DELAY;
        addLog('info', `Attempting to reconnect in ${delay}ms...`);
        setState('connecting'); // Update state for UI feedback
        setTimeout(() => {
          // Check mounted status again before actually connecting
          if (isMountedRef.current) {
            connect(); // Call stable connect again
          }
        }, delay);
      } else if (currentState !== 'failed' && currentState !== 'authenticating') {
        failConnection('Connection closed unexpectedly.');
      }
    };

    // --- Connect Client & Handle Auth ---
    try {
      addLog('info', 'Connecting client...');
      // Client/transport refs are already asserted above
      await clientRef.current!.connect(transportRef.current);

      addLog('info', 'Client connected. Loading tools...');
      setState('loading'); // Update state

      const toolsResponse = await clientRef.current!.request({ method: 'tools/list' }, ListToolsResultSchema);
      // Check mounted status *before* final state update
      if (isMountedRef.current) {
        setTools(toolsResponse.tools);
        addLog('info', `Loaded ${toolsResponse.tools.length} tools.`);
        setState('ready'); // Final success state
        connectingRef.current = false; // Connection attempt finished successfully
        connectAttemptRef.current = 0; // Reset attempt counter
      }
    } catch (connectErr) {
      addLog('debug', 'Client connect error:', connectErr);
      const errorInstance = connectErr instanceof Error ? connectErr : new Error(String(connectErr));

      if (errorInstance instanceof UnauthorizedError || errorInstance.message.includes('Unauthorized') || errorInstance.message.includes('401')) {
        addLog('info', 'Authentication required. Initiating SDK auth flow...');
        setState('authenticating'); // Update state
        // Start auth timeout
        if (authTimeoutRef.current) clearTimeout(authTimeoutRef.current);
        authTimeoutRef.current = setTimeout(() => {
          // Check ref state before failing
          if (isMountedRef.current && stateRef.current === 'authenticating') {
            failConnection('Authentication timed out. Please try again or use the manual link if available.');
          }
        }, AUTH_TIMEOUT);

        try {
          assert(authProviderRef.current, "Auth Provider not available for auth flow");
          const authResult = await auth(authProviderRef.current, { serverUrl: url });

          // Check mounted status before proceeding
          if (!isMountedRef.current) return;

          if (authResult === 'AUTHORIZED') {
            addLog('info', 'Authentication successful via existing token or refresh. Reconnecting...');
            if (authTimeoutRef.current) clearTimeout(authTimeoutRef.current);
            connectingRef.current = false; // Allow reconnect
            connect(); // Call stable connect to re-establish
          } else if (authResult === 'REDIRECT') {
            addLog('info', 'Redirecting for authentication. Waiting for callback...');
            // State is 'authenticating', timeout running. connectingRef remains true.
          }
        } catch (sdkAuthError) {
          if (!isMountedRef.current) return; // Check mount before failConnection
          if (authTimeoutRef.current) clearTimeout(authTimeoutRef.current);
          failConnection(`Failed to initiate authentication: ${sdkAuthError instanceof Error ? sdkAuthError.message : String(sdkAuthError)}`, sdkAuthError instanceof Error ? sdkAuthError : undefined);
          // connectingRef set to false inside failConnection
        }
      } else {
        // Handle other connection errors
        failConnection(`Failed to connect: ${errorInstance.message}`, errorInstance);
        // connectingRef set to false inside failConnection
      }
      // Only set connectingRef false here if NOT waiting for redirect
      // Note: failConnection already sets it to false. If redirect happens, it remains true.
      // If AUTHORIZED happens, we immediately call connect again, which sets it true.
      // This seems correct.
    }
  }, [
    // Stable callback dependencies
    addLog, failConnection,
    // Configuration dependencies that require full reconnect if changed
    url, storageKeyPrefix, clientName, clientUri, callbackUrl,
    // clientConfig changes might require reconnect? Add if necessary:
    // clientConfig.name, clientConfig.version
    // Note: connect does NOT depend on state or autoReconnect anymore
  ]);


  // callTool is stable (depends on stable addLog, failConnection, connect, and URL)
  const callTool = useCallback(
    async (name: string, args?: Record<string, unknown>) => {
      // Use stateRef for check, state for throwing error message
      if (stateRef.current !== 'ready' || !clientRef.current) {
        throw new Error(`MCP client is not ready (current state: ${state}). Cannot call tool "${name}".`);
      }
      addLog('info', `Calling tool: ${name}`, args);
      try {
        const result = await clientRef.current.request(
          { method: 'tools/call', params: { name, arguments: args } },
          CallToolResultSchema,
        );
        addLog('info', `Tool "${name}" call successful:`, result);
        return result;
      } catch (err) {
        addLog('error', `Error calling tool "${name}": ${err instanceof Error ? err.message : String(err)}`, err);
        const errorInstance = err instanceof Error ? err : new Error(String(err));

        if (errorInstance instanceof UnauthorizedError || errorInstance.message.includes('Unauthorized') || errorInstance.message.includes('401')) {
          addLog('warn', 'Tool call unauthorized, attempting re-authentication...');
          setState('authenticating'); // Update UI state
          if (authTimeoutRef.current) clearTimeout(authTimeoutRef.current); // Reset timeout
          authTimeoutRef.current = setTimeout(() => { /* ... timeout logic ... */ }, AUTH_TIMEOUT);

          try {
            assert(authProviderRef.current, "Auth Provider not available for tool re-auth");
            const authResult = await auth(authProviderRef.current, { serverUrl: url });

            if (!isMountedRef.current) return; // Check mount

            if (authResult === 'AUTHORIZED') {
              addLog('info', 'Re-authentication successful. Retrying tool call is recommended, or reconnecting.');
              if (authTimeoutRef.current) clearTimeout(authTimeoutRef.current);
              // Option 1: Just set state ready and let user retry tool?
              // setState('ready');
              // Option 2: Reconnect client completely? Safer.
              connectingRef.current = false;
              connect(); // Reconnect session
            } else if (authResult === 'REDIRECT') {
              addLog('info', 'Redirecting for re-authentication for tool call.');
              // State is authenticating, wait for callback
            }
          } catch (sdkAuthError) {
            if (!isMountedRef.current) return;
            if (authTimeoutRef.current) clearTimeout(authTimeoutRef.current);
            failConnection(`Re-authentication failed: ${sdkAuthError instanceof Error ? sdkAuthError.message : String(sdkAuthError)}`, sdkAuthError instanceof Error ? sdkAuthError : undefined);
          }
        }
        // Re-throw original error unless handled by re-auth redirect
        // @ts-ignore
        if (stateRef.current !== 'authenticating') { // Only re-throw if not waiting for redirect
          throw err;
        }
        // If authenticating, we might want to signal the caller differently,
        // but for now, we don't re-throw, assuming the UI will react to the 'authenticating' state.
        return undefined; // Or indicate auth required?
      }
    },
    [state, url, addLog, failConnection, connect], // Depends on state for error message, url, and stable callbacks
  );


  // retry is stable (depends on stable addLog, connect)
  const retry = useCallback(() => {
    // Use stateRef for check
    if (stateRef.current === 'failed') {
      addLog('info', 'Retry requested...');
      // connect() will handle resetting state and error internally
      connect();
    } else {
      addLog('warn', `Retry called but state is not 'failed' (state: ${stateRef.current}). Ignoring.`);
    }
  }, [addLog, connect]); // Depends only on stable callbacks


  // authenticate is stable (depends on stable addLog, retry, connect)
  const authenticate = useCallback(() => {
    addLog('info', 'Manual authentication requested...');
    const currentState = stateRef.current; // Use ref

    if (currentState === 'failed') {
      addLog('info', 'Attempting to reconnect and authenticate via retry...');
      retry();
    } else if (currentState === 'authenticating') {
      addLog('warn', 'Already attempting authentication. Check for blocked popups or wait for timeout.');
      const manualUrl = authProviderRef.current?.getLastAttemptedAuthUrl();
      if (manualUrl && !authUrl) { // Use component state `authUrl` here
        setAuthUrl(manualUrl);
        addLog('info', 'Manual authentication URL retrieved:', manualUrl);
      }
    } else {
      addLog('info', `Client not in a state requiring manual authentication trigger (state: ${currentState}). If needed, try disconnecting and reconnecting.`);
      // Optionally, force re-auth even if ready?
      // addLog('info', 'Forcing re-authentication...');
      // setState('authenticating');
      // assert(authProviderRef.current, "Auth Provider not available");
      // auth(authProviderRef.current, { serverUrl: url }).catch(failConnection);
    }
  }, [addLog, retry, authUrl]); // Depends on stable callbacks and authUrl state


  // clearStorage is stable (depends on stable addLog, disconnect)
  const clearStorage = useCallback(() => {
    if (authProviderRef.current) {
      const count = authProviderRef.current.clearStorage();
      addLog('info', `Cleared ${count} item(s) from localStorage for ${url}.`);
      setAuthUrl(undefined); // Clear manual URL state
      // Disconnect should reset state appropriately
      disconnect();
    } else {
      addLog('warn', 'Auth provider not initialized, cannot clear storage.');
    }
  }, [url, addLog, disconnect]); // Depends on url and stable callbacks


  // ===== Effects =====

  // Effect for handling auth callback messages from popup (Stable dependencies)
  useEffect(() => {
    const messageHandler = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === 'mcp_auth_callback') {
        addLog('info', 'Received auth callback message.', event.data);
        if (authTimeoutRef.current) clearTimeout(authTimeoutRef.current);

        if (event.data.success) {
          addLog('info', 'Authentication successful via popup. Reconnecting client...');
          connectingRef.current = false;
          connect(); // Call stable connect
        } else {
          failConnection(`Authentication failed in callback: ${event.data.error || 'Unknown reason.'}`); // Call stable failConnection
        }
      }
    };
    window.addEventListener('message', messageHandler);
    addLog('debug', 'Auth callback message listener added.');
    return () => {
      window.removeEventListener('message', messageHandler);
      addLog('debug', 'Auth callback message listener removed.');
      if (authTimeoutRef.current) clearTimeout(authTimeoutRef.current);
    };
    // Dependencies are stable callbacks
  }, [addLog, failConnection, connect]);

  // Effect for initial connection (Stable dependencies)
  useEffect(() => {
    isMountedRef.current = true;
    addLog('debug', 'useMcp mounted, initiating connection.');
    connectAttemptRef.current = 0;
    // Initialize provider here if it doesn't exist, ensuring it uses latest options
    if (!authProviderRef.current || authProviderRef.current.serverUrl !== url) {
      authProviderRef.current = new BrowserOAuthClientProvider(url, {
        storageKeyPrefix, clientName, clientUri, callbackUrl
      });
      addLog('debug', 'BrowserOAuthClientProvider initialized/updated on mount/option change.');
    }
    connect(); // Call stable connect

    return () => {
      isMountedRef.current = false;
      addLog('debug', 'useMcp unmounting, disconnecting.');
      disconnect(true); // Call stable disconnect
    };
    // Ensure all config options that influence provider/connect are dependencies
  }, [
    url, storageKeyPrefix, callbackUrl, clientName, clientUri, // Core config
    clientConfig.name, clientConfig.version, // Include client config if it affects Client init
    connect, disconnect // Stable callbacks are OK as deps
  ]);

  // Effect for auto-retry logic (Stable dependencies)
  useEffect(() => {
    let retryTimeoutId: number | null = null;
    // Use state directly here, as this effect *should* run when state changes to 'failed'
    if (state === 'failed' && autoRetry && connectAttemptRef.current > 0) {
      const delay = typeof autoRetry === 'number' ? autoRetry : DEFAULT_RETRY_DELAY;
      addLog('info', `Connection failed, auto-retrying in ${delay}ms...`);
      retryTimeoutId = setTimeout(() => {
        // Check mount status and state again before retrying
        if (isMountedRef.current && stateRef.current === 'failed') {
          retry(); // Call stable retry
        }
      }, delay);
    }
    return () => {
      if (retryTimeoutId) clearTimeout(retryTimeoutId);
    };
    // Depends on state (to trigger), autoRetry config, and stable retry/addLog callbacks
  }, [state, autoRetry, retry, addLog]);


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