// useMcp.ts
import { CallToolResultSchema, JSONRPCMessage, ListToolsResultSchema, Tool } from '@modelcontextprotocol/sdk/types.js'
import { useCallback, useEffect, useRef, useState } from 'react'
// Import both transport types
import { SSEClientTransport, SSEClientTransportOptions } from '@modelcontextprotocol/sdk/client/sse.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js' // Added
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { auth, UnauthorizedError, OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js'
import { BrowserOAuthClientProvider } from '../auth/browser-provider.js' // Adjust path
import { assert } from '../utils/assert.js' // Adjust path
import type { UseMcpOptions, UseMcpResult } from './types.js' // Adjust path
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js' // Added for type safety

const DEFAULT_RECONNECT_DELAY = 3000
const DEFAULT_RETRY_DELAY = 5000
const AUTH_TIMEOUT = 5 * 60 * 1000

// Define Transport types literal for clarity
type TransportType = 'http' | 'sse'

export function useMcp(options: UseMcpOptions): UseMcpResult {
  const {
    url,
    clientName,
    clientUri,
    callbackUrl = typeof window !== 'undefined' ? new URL('/oauth/callback', window.location.origin).toString() : '/oauth/callback',
    storageKeyPrefix = 'mcp:auth',
    clientConfig = {},
    customHeaders = {},
    debug = false,
    autoRetry = false,
    autoReconnect = DEFAULT_RECONNECT_DELAY,
  } = options

  const [state, setState] = useState<UseMcpResult['state']>('discovering')
  const [tools, setTools] = useState<Tool[]>([])
  const [error, setError] = useState<string | undefined>(undefined)
  const [log, setLog] = useState<UseMcpResult['log']>([])
  const [authUrl, setAuthUrl] = useState<string | undefined>(undefined)

  const clientRef = useRef<Client | null>(null)
  // Transport ref can hold either type now
  const transportRef = useRef<Transport | null>(null)
  const authProviderRef = useRef<BrowserOAuthClientProvider | null>(null)
  const connectingRef = useRef<boolean>(false)
  const isMountedRef = useRef<boolean>(true)
  const connectAttemptRef = useRef<number>(0)
  const authTimeoutRef = useRef<number | null>(null)

  // --- Refs for values used in callbacks ---
  const stateRef = useRef(state)
  const autoReconnectRef = useRef(autoReconnect)
  // Ref to store the type of transport that successfully connected
  const successfulTransportRef = useRef<TransportType | null>(null)

  // --- Effect to keep refs updated ---
  useEffect(() => {
    stateRef.current = state
    autoReconnectRef.current = autoReconnect
  }, [state, autoReconnect])

  // --- Stable Callbacks ---
  // addLog is stable (empty dependency array)
  const addLog = useCallback(
    (level: UseMcpResult['log'][0]['level'], message: string, ...args: unknown[]) => {
      // if (level === 'debug' && !debug) return; // Uncomment if using debug flag
      const fullMessage = args.length > 0 ? `${message} ${args.map((arg) => JSON.stringify(arg)).join(' ')}` : message
      console[level](`[useMcp] ${fullMessage}`)
      // Use isMountedRef to prevent state updates after unmount
      if (isMountedRef.current) {
        setLog((prevLog) => [...prevLog.slice(-100), { level, message: fullMessage, timestamp: Date.now() }])
      }
    },
    [], // Empty dependency array makes this stable
  )

  // disconnect is stable (depends only on stable addLog)
  const disconnect = useCallback(
    async (quiet = false) => {
      if (!quiet) addLog('info', 'Disconnecting...')
      connectingRef.current = false
      if (authTimeoutRef.current) clearTimeout(authTimeoutRef.current)
      authTimeoutRef.current = null

      const transport = transportRef.current
      clientRef.current = null // Ensure client is cleared
      transportRef.current = null // Ensure transport is cleared

      // Only reset state if mounted and not a quiet disconnect
      if (isMountedRef.current && !quiet) {
        setState('discovering')
        setTools([])
        setError(undefined)
        setAuthUrl(undefined)
      }

      if (transport) {
        try {
          await transport.close()
          if (!quiet) addLog('debug', 'Transport closed')
        } catch (err) {
          if (!quiet) addLog('warn', 'Error closing transport:', err)
        }
      }
    },
    [addLog], // Depends only on stable addLog
  )

  // failConnection is stable (depends only on stable addLog)
  const failConnection = useCallback(
    (errorMessage: string, connectionError?: Error) => {
      addLog('error', errorMessage, connectionError ?? '')
      if (isMountedRef.current) {
        setState('failed') // Set state to failed
        setError(errorMessage)
        const manualUrl = authProviderRef.current?.getLastAttemptedAuthUrl()
        if (manualUrl) {
          setAuthUrl(manualUrl)
          addLog('info', 'Manual authentication URL may be available.', manualUrl)
        }
      }
      connectingRef.current = false // Ensure connection attempt is marked as finished
      // Do not call disconnect here - allow user to see error and retry
    },
    [addLog],
  ) // Depends only on stable addLog

  // connect needs to be stable. Remove state/autoReconnect deps, use refs inside.
  const connect = useCallback(async () => {
    // Prevent concurrent connections
    if (connectingRef.current) {
      addLog('debug', 'Connection attempt already in progress.')
      return
    }
    if (!isMountedRef.current) {
      addLog('debug', 'Connect called after unmount, aborting.')
      return
    }

    connectingRef.current = true // Mark start of connection sequence
    connectAttemptRef.current += 1
    setError(undefined)
    setAuthUrl(undefined)
    successfulTransportRef.current = null // Reset successful transport type
    setState('discovering')
    addLog('info', `Connecting attempt #${connectAttemptRef.current} to ${url}...`)

    // Initialize provider/client if needed (idempotent)
    // Ensure provider/client are initialized (idempotent check)
    if (!authProviderRef.current) {
      authProviderRef.current = new BrowserOAuthClientProvider(url, {
        storageKeyPrefix,
        clientName,
        clientUri,
        callbackUrl,
      })
      addLog('debug', 'BrowserOAuthClientProvider initialized in connect.')
    }
    if (!clientRef.current) {
      clientRef.current = new Client(
        { name: clientConfig.name || 'use-mcp-react-client', version: clientConfig.version || '0.1.0' },
        { capabilities: {} },
      )
      addLog('debug', 'MCP Client initialized in connect.')
    }

    // --- Helper function for a single connection attempt ---
    const tryConnectWithTransport = async (transportType: TransportType): Promise<'success' | 'fallback' | 'auth_redirect' | 'failed'> => {
      addLog('info', `Attempting connection with ${transportType.toUpperCase()} transport...`)
      // Ensure state reflects current attempt phase, unless already authenticating
      if (stateRef.current !== 'authenticating') {
        setState('connecting')
      }

      let transportInstance: Transport // Use base Transport type

      // 1. Create Transport Instance & Close Previous
      try {
        assert(authProviderRef.current, 'Auth Provider must be initialized')
        assert(clientRef.current, 'Client must be initialized')

        // Close existing transport before creating new one
        if (transportRef.current) {
          await transportRef.current.close().catch((e) => addLog('warn', `Error closing previous transport: ${e.message}`))
          transportRef.current = null
        }

        const commonOptions: SSEClientTransportOptions = {
          authProvider: authProviderRef.current,
          requestInit: { headers: customHeaders },
        }
        const targetUrl = new URL(url)

        if (transportType === 'http') {
          transportInstance = new StreamableHTTPClientTransport(targetUrl, commonOptions)
        } else {
          // sse
          transportInstance = new SSEClientTransport(targetUrl, commonOptions)
        }
        transportRef.current = transportInstance // Assign to ref immediately
        addLog('debug', `${transportType.toUpperCase()} transport created.`)
      } catch (err) {
        // Use stable failConnection
        failConnection(
          `Failed to create ${transportType.toUpperCase()} transport: ${err instanceof Error ? err.message : String(err)}`,
          err instanceof Error ? err : undefined,
        )
        return 'failed' // Indicate definitive failure
      }

      // 2. Setup Handlers for the new transportInstance
      transportInstance.onmessage = (message: JSONRPCMessage) => {
        // Use stable addLog
        addLog('debug', `[Transport] Received: ${JSON.stringify(message)}`)
        // @ts-ignore
        clientRef.current?.handleMessage(message) // Forward to current client
      }
      transportInstance.onerror = (err: Error) => {
        // Transport errors usually mean connection is lost/failed definitively for this transport
        // Use stable failConnection
        failConnection(`Transport error (${transportType.toUpperCase()}): ${err.message}`, err)
        // Should we return 'failed' here? failConnection sets state, maybe that's enough.
      }
      transportInstance.onclose = () => {
        // Use refs for checks and stable callbacks
        if (!isMountedRef.current || connectingRef.current) return // Ignore if connecting/unmounted

        addLog('info', `Transport connection closed (${successfulTransportRef.current || 'unknown'} type).`)
        const currentState = stateRef.current
        const currentAutoReconnect = autoReconnectRef.current

        if (currentState === 'ready' && currentAutoReconnect) {
          const delay = typeof currentAutoReconnect === 'number' ? currentAutoReconnect : DEFAULT_RECONNECT_DELAY
          addLog('info', `Attempting to reconnect in ${delay}ms...`)
          setState('connecting')
          setTimeout(() => {
            if (isMountedRef.current) {
              connect() // Start full connect logic again (will default to HTTP)
            }
          }, delay)
        } else if (currentState !== 'failed' && currentState !== 'authenticating') {
          // Use stable failConnection
          failConnection('Connection closed unexpectedly.')
        }
      }

      // 3. Attempt client.connect()
      try {
        addLog('info', `Connecting client via ${transportType.toUpperCase()}...`)
        await clientRef.current!.connect(transportInstance)

        // --- Success Path ---
        addLog('info', `Client connected via ${transportType.toUpperCase()}. Loading tools...`)
        successfulTransportRef.current = transportType // Store successful type
        setState('loading')

        const toolsResponse = await clientRef.current!.request({ method: 'tools/list' }, ListToolsResultSchema)

        if (isMountedRef.current) {
          // Check mount before final state updates
          setTools(toolsResponse.tools)
          addLog('info', `Loaded ${toolsResponse.tools.length} tools.`)
          setState('ready') // Final success state
          // connectingRef will be set to false after orchestration logic
          connectAttemptRef.current = 0 // Reset on success
          return 'success'
        } else {
          return 'failed' // Failed due to unmount after connect but before ready
        }
      } catch (connectErr) {
        // --- Error Handling Path ---
        addLog('debug', `Client connect error via ${transportType.toUpperCase()}:`, connectErr)
        const errorInstance = connectErr instanceof Error ? connectErr : new Error(String(connectErr))

        // Check for 404/405 specifically for HTTP transport
        const errorMessage = errorInstance.message
        const is404 = errorMessage.includes('404') || errorMessage.includes('Not Found')
        const is405 = errorMessage.includes('405') || errorMessage.includes('Method Not Allowed')
        const isLikelyCors =
          errorMessage === 'Failed to fetch' /* Chrome */ ||
          errorMessage === 'NetworkError when attempting to fetch resource.' /* Firefox */ ||
          errorMessage === 'Load failed' /* Safari */

        if (transportType === 'http' && (is404 || is405 || isLikelyCors)) {
          addLog('warn', `HTTP transport failed (${isLikelyCors ? 'CORS' : is404 ? '404' : '405'}). Will attempt fallback to SSE.`)
          return 'fallback' // Signal that fallback should be attempted
        }

        // Check for Auth error (Simplified - requires more thought for interaction with fallback)
        if (errorInstance instanceof UnauthorizedError || errorMessage.includes('Unauthorized') || errorMessage.includes('401')) {
          addLog('info', 'Authentication required. Initiating SDK auth flow...')
          // Ensure state is set only once if multiple attempts trigger auth
          if (stateRef.current !== 'authenticating') {
            setState('authenticating')
            if (authTimeoutRef.current) clearTimeout(authTimeoutRef.current)
            authTimeoutRef.current = setTimeout(() => {
              /* ... timeout logic ... */
            }, AUTH_TIMEOUT)
          }

          try {
            assert(authProviderRef.current, 'Auth Provider not available for auth flow')
            const authResult = await auth(authProviderRef.current, { serverUrl: url })

            if (!isMountedRef.current) return 'failed' // Unmounted during auth

            if (authResult === 'AUTHORIZED') {
              addLog('info', 'Authentication successful via existing token or refresh. Re-attempting connection...')
              if (authTimeoutRef.current) clearTimeout(authTimeoutRef.current)
              // Re-trigger the *entire* connect sequence after successful auth
              // It will start with HTTP again.
              // We return 'failed' here to stop current sequence, connect() below will handle restart.
              // Set connectingRef false so outer connect call can proceed
              connectingRef.current = false
              connect() // Restart full connection sequence
              return 'failed' // Stop this attempt sequence, new one started
            } else if (authResult === 'REDIRECT') {
              addLog('info', 'Redirecting for authentication. Waiting for callback...')
              return 'auth_redirect' // Signal that we are waiting for redirect
            }
          } catch (sdkAuthError) {
            if (!isMountedRef.current) return 'failed'
            if (authTimeoutRef.current) clearTimeout(authTimeoutRef.current)
            // Use stable failConnection
            failConnection(
              `Failed to initiate authentication: ${sdkAuthError instanceof Error ? sdkAuthError.message : String(sdkAuthError)}`,
              sdkAuthError instanceof Error ? sdkAuthError : undefined,
            )
            return 'failed' // Auth initiation failed
          }
        }

        // Handle other connection errors
        // Use stable failConnection
        failConnection(`Failed to connect via ${transportType.toUpperCase()}: ${errorMessage}`, errorInstance)
        return 'fallback' // If our logic above is wrong, we'd prevent HTTPs servers from ever working. So always fall back as a last resort.
      }
    } // End of tryConnectWithTransport helper

    // --- Orchestrate Connection Attempts ---
    let finalStatus: 'success' | 'auth_redirect' | 'failed' | 'fallback' = 'failed' // Default to failed

    // 1. Try HTTP
    const httpResult = await tryConnectWithTransport('http')

    // 2. Try SSE only if HTTP requested fallback and we haven't failed/redirected
    if (httpResult === 'fallback' && isMountedRef.current && stateRef.current !== 'failed' && stateRef.current !== 'authenticating') {
      const sseResult = await tryConnectWithTransport('sse')
      finalStatus = sseResult // Use SSE result as final status
    } else {
      finalStatus = httpResult // Use HTTP result if no fallback was needed/possible
    }

    // --- Finalize Connection State ---
    // Set connectingRef based on the final outcome.
    // It should be false if 'success' or 'failed'.
    // It should remain true if 'auth_redirect'.
    if (finalStatus === 'success' || finalStatus === 'failed') {
      connectingRef.current = false
    }
    // If finalStatus is 'auth_redirect', connectingRef remains true (set at the start).

    addLog('debug', `Connection sequence finished with status: ${finalStatus}`)
  }, [
    // Stable callback dependencies
    addLog,
    failConnection,
    disconnect,
    auth, // Include SDK auth function if used directly
    // Configuration dependencies
    url,
    storageKeyPrefix,
    clientName,
    clientUri,
    callbackUrl,
    clientConfig.name,
    clientConfig.version,
    // No state/autoReconnect dependency here
  ])

  // callTool is stable (depends on stable addLog, failConnection, connect, and URL)
  const callTool = useCallback(
    async (name: string, args?: Record<string, unknown>) => {
      // Use stateRef for check, state for throwing error message
      if (stateRef.current !== 'ready' || !clientRef.current) {
        throw new Error(`MCP client is not ready (current state: ${state}). Cannot call tool "${name}".`)
      }
      addLog('info', `Calling tool: ${name}`, args)
      try {
        const result = await clientRef.current.request({ method: 'tools/call', params: { name, arguments: args } }, CallToolResultSchema)
        addLog('info', `Tool "${name}" call successful:`, result)
        return result
      } catch (err) {
        addLog('error', `Error calling tool "${name}": ${err instanceof Error ? err.message : String(err)}`, err)
        const errorInstance = err instanceof Error ? err : new Error(String(err))

        if (
          errorInstance instanceof UnauthorizedError ||
          errorInstance.message.includes('Unauthorized') ||
          errorInstance.message.includes('401')
        ) {
          addLog('warn', 'Tool call unauthorized, attempting re-authentication...')
          setState('authenticating') // Update UI state
          if (authTimeoutRef.current) clearTimeout(authTimeoutRef.current) // Reset timeout
          authTimeoutRef.current = setTimeout(() => {
            /* ... timeout logic ... */
          }, AUTH_TIMEOUT)

          try {
            assert(authProviderRef.current, 'Auth Provider not available for tool re-auth')
            const authResult = await auth(authProviderRef.current, { serverUrl: url })

            if (!isMountedRef.current) return // Check mount

            if (authResult === 'AUTHORIZED') {
              addLog('info', 'Re-authentication successful. Retrying tool call is recommended, or reconnecting.')
              if (authTimeoutRef.current) clearTimeout(authTimeoutRef.current)
              // Option 1: Just set state ready and let user retry tool?
              // setState('ready');
              // Option 2: Reconnect client completely? Safer.
              connectingRef.current = false
              connect() // Reconnect session
            } else if (authResult === 'REDIRECT') {
              addLog('info', 'Redirecting for re-authentication for tool call.')
              // State is authenticating, wait for callback
            }
          } catch (sdkAuthError) {
            if (!isMountedRef.current) return
            if (authTimeoutRef.current) clearTimeout(authTimeoutRef.current)
            failConnection(
              `Re-authentication failed: ${sdkAuthError instanceof Error ? sdkAuthError.message : String(sdkAuthError)}`,
              sdkAuthError instanceof Error ? sdkAuthError : undefined,
            )
          }
        }
        // Re-throw original error unless handled by re-auth redirect
        // @ts-ignore
        if (stateRef.current !== 'authenticating') {
          // Only re-throw if not waiting for redirect
          throw err
        }
        // If authenticating, we might want to signal the caller differently,
        // but for now, we don't re-throw, assuming the UI will react to the 'authenticating' state.
        return undefined // Or indicate auth required?
      }
    },
    [state, url, addLog, failConnection, connect], // Depends on state for error message, url, and stable callbacks
  )

  // retry is stable (depends on stable addLog, connect)
  const retry = useCallback(() => {
    // Use stateRef for check
    if (stateRef.current === 'failed') {
      addLog('info', 'Retry requested...')
      // connect() will handle resetting state and error internally
      connect()
    } else {
      addLog('warn', `Retry called but state is not 'failed' (state: ${stateRef.current}). Ignoring.`)
    }
  }, [addLog, connect]) // Depends only on stable callbacks

  // authenticate is stable (depends on stable addLog, retry, connect)
  const authenticate = useCallback(() => {
    addLog('info', 'Manual authentication requested...')
    const currentState = stateRef.current // Use ref

    if (currentState === 'failed') {
      addLog('info', 'Attempting to reconnect and authenticate via retry...')
      retry()
    } else if (currentState === 'authenticating') {
      addLog('warn', 'Already attempting authentication. Check for blocked popups or wait for timeout.')
      const manualUrl = authProviderRef.current?.getLastAttemptedAuthUrl()
      if (manualUrl && !authUrl) {
        // Use component state `authUrl` here
        setAuthUrl(manualUrl)
        addLog('info', 'Manual authentication URL retrieved:', manualUrl)
      }
    } else {
      addLog(
        'info',
        `Client not in a state requiring manual authentication trigger (state: ${currentState}). If needed, try disconnecting and reconnecting.`,
      )
      // Optionally, force re-auth even if ready?
      // addLog('info', 'Forcing re-authentication...');
      // setState('authenticating');
      // assert(authProviderRef.current, "Auth Provider not available");
      // auth(authProviderRef.current, { serverUrl: url }).catch(failConnection);
    }
  }, [addLog, retry, authUrl]) // Depends on stable callbacks and authUrl state

  // clearStorage is stable (depends on stable addLog, disconnect)
  const clearStorage = useCallback(() => {
    if (authProviderRef.current) {
      const count = authProviderRef.current.clearStorage()
      addLog('info', `Cleared ${count} item(s) from localStorage for ${url}.`)
      setAuthUrl(undefined) // Clear manual URL state
      // Disconnect should reset state appropriately
      disconnect()
    } else {
      addLog('warn', 'Auth provider not initialized, cannot clear storage.')
    }
  }, [url, addLog, disconnect]) // Depends on url and stable callbacks

  // ===== Effects =====

  // Effect for handling auth callback messages from popup (Stable dependencies)
  useEffect(() => {
    const messageHandler = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      if (event.data?.type === 'mcp_auth_callback') {
        addLog('info', 'Received auth callback message.', event.data)
        if (authTimeoutRef.current) clearTimeout(authTimeoutRef.current)

        if (event.data.success) {
          addLog('info', 'Authentication successful via popup. Reconnecting client...')
          connectingRef.current = false
          connect() // Call stable connect
        } else {
          failConnection(`Authentication failed in callback: ${event.data.error || 'Unknown reason.'}`) // Call stable failConnection
        }
      }
    }
    window.addEventListener('message', messageHandler)
    addLog('debug', 'Auth callback message listener added.')
    return () => {
      window.removeEventListener('message', messageHandler)
      addLog('debug', 'Auth callback message listener removed.')
      if (authTimeoutRef.current) clearTimeout(authTimeoutRef.current)
    }
    // Dependencies are stable callbacks
  }, [addLog, failConnection, connect])

  // Initial Connection (depends on config and stable callbacks)
  useEffect(() => {
    /* ... as before, calls stable connect/disconnect ... */
    isMountedRef.current = true
    addLog('debug', 'useMcp mounted, initiating connection.')
    connectAttemptRef.current = 0
    // Initialize provider here if needed
    if (!authProviderRef.current || authProviderRef.current.serverUrl !== url) {
      authProviderRef.current = new BrowserOAuthClientProvider(url, {
        storageKeyPrefix,
        clientName,
        clientUri,
        callbackUrl,
      })
      addLog('debug', 'BrowserOAuthClientProvider initialized/updated on mount/option change.')
    }
    connect() // Call stable connect
    return () => {
      isMountedRef.current = false
      addLog('debug', 'useMcp unmounting, disconnecting.')
      disconnect(true) // Call stable disconnect
    }
  }, [
    url,
    storageKeyPrefix,
    callbackUrl,
    clientName,
    clientUri,
    clientConfig.name,
    clientConfig.version,
    connect,
    disconnect, // Stable callbacks
  ])

  // Auto-Retry (depends on state, config, stable callbacks)
  useEffect(() => {
    let retryTimeoutId: number | null = null
    // Use state directly here, as this effect *should* run when state changes to 'failed'
    if (state === 'failed' && autoRetry && connectAttemptRef.current > 0) {
      const delay = typeof autoRetry === 'number' ? autoRetry : DEFAULT_RETRY_DELAY
      addLog('info', `Connection failed, auto-retrying in ${delay}ms...`)
      retryTimeoutId = setTimeout(() => {
        // Check mount status and state again before retrying
        if (isMountedRef.current && stateRef.current === 'failed') {
          retry() // Call stable retry
        }
      }, delay)
    }
    return () => {
      if (retryTimeoutId) clearTimeout(retryTimeoutId)
    }
    // Depends on state (to trigger), autoRetry config, and stable retry/addLog callbacks
  }, [state, autoRetry, retry, addLog])

  // --- Return Public API ---
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
  }
}
