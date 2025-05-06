// useMcp.ts
import { CallToolResultSchema, JSONRPCMessage, ListToolsResultSchema, Tool } from '@modelcontextprotocol/sdk/types.js'
import { useCallback, useEffect, useRef, useState } from 'react'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
// Import the main auth function and error type
import { auth, UnauthorizedError, OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js'
// Keep BrowserOAuthClientProvider
import { BrowserOAuthClientProvider } from '../auth/browser-provider.js' // Adjust path
import { assert } from '../utils/assert.js' // Adjust path
import type { UseMcpOptions, UseMcpResult } from './types.js' // Adjust path

const DEFAULT_RECONNECT_DELAY = 3000
const DEFAULT_RETRY_DELAY = 5000
const AUTH_TIMEOUT = 5 * 60 * 1000 // 5 minutes for user to complete auth in popup

export function useMcp(options: UseMcpOptions): UseMcpResult {
  const {
    url,
    clientName,
    clientUri,
    callbackUrl = typeof window !== 'undefined' ? new URL('/oauth/callback', window.location.origin).toString() : '/oauth/callback',
    storageKeyPrefix = 'mcp:auth',
    clientConfig = {},
    debug = false,
    autoRetry = false,
    autoReconnect = DEFAULT_RECONNECT_DELAY,
    // popupFeatures is now handled within BrowserOAuthClientProvider
  } = options

  const [state, setState] = useState<UseMcpResult['state']>('discovering')
  const [tools, setTools] = useState<Tool[]>([])
  const [error, setError] = useState<string | undefined>(undefined)
  const [log, setLog] = useState<UseMcpResult['log']>([])
  // Store the URL for manual fallback if needed
  const [authUrl, setAuthUrl] = useState<string | undefined>(undefined)

  const clientRef = useRef<Client | null>(null)
  const transportRef = useRef<SSEClientTransport | null>(null)
  const authProviderRef = useRef<BrowserOAuthClientProvider | null>(null)
  const connectingRef = useRef<boolean>(false)
  const isMountedRef = useRef<boolean>(true)
  const connectAttemptRef = useRef<number>(0)
  const authTimeoutRef = useRef<number | null>(null) // Use number for type safety

  const addLog = useCallback(
    (level: UseMcpResult['log'][0]['level'], message: string, ...args: unknown[]) => {
      const fullMessage = args.length > 0 ? `${message} ${args.map((arg) => JSON.stringify(arg)).join(' ')}` : message
      console[level](`[useMcp] ${fullMessage}`)
      if (isMountedRef.current) {
        setLog((prevLog) => [...prevLog.slice(-100), { level, message: fullMessage, timestamp: Date.now() }]) // Limit log size
      }
    },
    [], // No dependencies needed if `debug` isn't used inside
  )

  const disconnect = useCallback(
    async (quiet = false) => {
      if (!quiet) addLog('info', 'Disconnecting...')
      connectingRef.current = false
      if (authTimeoutRef.current) clearTimeout(authTimeoutRef.current)
      authTimeoutRef.current = null

      const client = clientRef.current
      const transport = transportRef.current
      clientRef.current = null
      transportRef.current = null // Prevent reconnection logic on explicit disconnect

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
    [addLog],
  )

  const failConnection = useCallback(
    (errorMessage: string, connectionError?: Error) => {
      addLog('error', errorMessage, connectionError ?? '')
      if (isMountedRef.current) {
        setState('failed')
        setError(errorMessage)
        // Attempt to get manual auth URL if provider exists
        const manualUrl = authProviderRef.current?.getLastAttemptedAuthUrl()
        if (manualUrl) {
          setAuthUrl(manualUrl)
          addLog('info', 'Manual authentication URL may be available.', manualUrl)
        }
      }
      connectingRef.current = false
      // Don't disconnect here, allow user to potentially retry/authenticate
      // disconnect(true); // No longer needed, state is 'failed'
    },
    [addLog],
  )

  const connect = useCallback(async () => {
    if (connectingRef.current) {
      addLog('debug', 'Connection attempt already in progress.')
      return
    }
    if (!isMountedRef.current) return

    connectingRef.current = true
    connectAttemptRef.current += 1
    setError(undefined)
    setAuthUrl(undefined) // Clear previous manual URL
    setState('discovering')
    addLog('info', `Connecting attempt #${connectAttemptRef.current} to ${url}...`)

    // 1. Initialize Auth Provider (only once)
    if (!authProviderRef.current) {
      authProviderRef.current = new BrowserOAuthClientProvider(url, {
        storageKeyPrefix,
        clientName,
        clientUri,
        callbackUrl,
      })
      addLog('debug', 'BrowserOAuthClientProvider initialized.')
    }

    // 2. Initialize MCP Client (only once)
    if (!clientRef.current) {
      clientRef.current = new Client(
        {
          name: clientConfig.name || 'use-mcp-react-client',
          version: clientConfig.version || '0.1.0',
        },
        { capabilities: {} },
      )
      addLog('debug', 'MCP Client initialized.')
    }

    // 3. Create/Recreate SSE Transport
    setState('connecting')
    if (transportRef.current) {
      await transportRef.current.close().catch((e) => addLog('warn', 'Error closing previous transport:', e))
      transportRef.current = null
    }
    try {
      transportRef.current = new SSEClientTransport(new URL(url), {
        authProvider: authProviderRef.current, // Pass provider for automatic token attachment
      })
      addLog('debug', 'SSEClientTransport created.')
    } catch (err) {
      failConnection(
        `Failed to create transport: ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err : undefined,
      )
      return
    }

    // 4. Set up Transport Handlers
    transportRef.current.onmessage = (message: JSONRPCMessage) => {
      addLog('debug', `[Transport] Received: ${JSON.stringify(message)}`)
      // @ts-ignore
      clientRef.current?.handleMessage(message)
    }
    transportRef.current.onerror = (err: Error) => {
      // Transport errors usually mean connection is lost/failed
      failConnection(`Transport error: ${err.message}`, err)
    }
    transportRef.current.onclose = () => {
      if (!isMountedRef.current || connectingRef.current) return // Ignore if unmounting or mid-connect

      addLog('info', 'Transport connection closed.')
      const currentState = state // Capture state at time of closure
      if (currentState === 'ready' && autoReconnect) {
        const delay = typeof autoReconnect === 'number' ? autoReconnect : DEFAULT_RECONNECT_DELAY
        addLog('info', `Attempting to reconnect in ${delay}ms...`)
        setTimeout(() => {
          if (isMountedRef.current && clientRef.current /* Check if still relevant */) {
            connect() // Re-run the connection logic
          }
        }, delay)
        setState('connecting')
      } else if (currentState !== 'failed' && currentState !== 'authenticating') {
        // If closed unexpectedly and not already failed/authenticating
        failConnection('Connection closed unexpectedly.')
      }
    }

    // 5. Connect Client & Handle Auth
    try {
      addLog('info', 'Connecting client...')
      assert(clientRef.current, 'Client not initialized')
      assert(transportRef.current, 'Transport not initialized')

      await clientRef.current.connect(transportRef.current)

      addLog('info', 'Client connected. Loading tools...')
      setState('loading')

      const toolsResponse = await clientRef.current.request({ method: 'tools/list' }, ListToolsResultSchema)
      if (isMountedRef.current) {
        setTools(toolsResponse.tools)
        addLog('info', `Loaded ${toolsResponse.tools.length} tools.`)
        setState('ready')
        connectingRef.current = false
        connectAttemptRef.current = 0 // Reset on success
      }
    } catch (connectErr) {
      addLog('debug', 'Client connect error:', connectErr)
      const errorInstance = connectErr instanceof Error ? connectErr : new Error(String(connectErr))

      // Check if it's specifically an UnauthorizedError or smells like one
      // NOTE: The SSE Transport might wrap the underlying 401. Check for UnauthorizedError first.
      if (
        errorInstance instanceof UnauthorizedError ||
        errorInstance.message.includes('Unauthorized') ||
        errorInstance.message.includes('401')
      ) {
        addLog('info', 'Authentication required. Initiating SDK auth flow...')
        setState('authenticating')
        // Start auth timeout timer
        if (authTimeoutRef.current) clearTimeout(authTimeoutRef.current)
        authTimeoutRef.current = setTimeout(() => {
          addLog('warn', 'Authentication timed out.')
          if (isMountedRef.current && state === 'authenticating') {
            // Check state again
            failConnection('Authentication timed out. Please try again or use the manual link if available.')
          }
        }, AUTH_TIMEOUT)

        try {
          assert(authProviderRef.current, 'Auth Provider not available for auth flow')
          // This call will handle discovery, checks, token refresh attempts,
          // and finally trigger provider.redirectToAuthorization if needed.
          const authResult = await auth(authProviderRef.current, { serverUrl: url })
          // If auth() resolves with "AUTHORIZED", it means refresh worked or existing token is valid.
          if (authResult === 'AUTHORIZED') {
            addLog('info', 'Authentication successful via existing token or refresh. Reconnecting transport...')
            if (authTimeoutRef.current) clearTimeout(authTimeoutRef.current) // Stop timeout
            // We might need to reconnect the transport or the whole client
            // Let's try reconnecting the client fully
            connectingRef.current = false // Allow reconnect
            connect() // Re-initiate connection flow
          }
          // If authResult is 'REDIRECT', the provider's redirectToAuthorization was called.
          // We are now waiting for the popup callback. State is already 'authenticating'.
          else if (authResult === 'REDIRECT') {
            addLog('info', 'Redirecting for authentication. Waiting for callback...')
            // The state is 'authenticating', timeout is running.
          }
        } catch (sdkAuthError) {
          // Handle errors from the SDK's auth() function itself (e.g., metadata fetch fail)
          if (authTimeoutRef.current) clearTimeout(authTimeoutRef.current)
          failConnection(
            `Failed to initiate authentication: ${sdkAuthError instanceof Error ? sdkAuthError.message : String(sdkAuthError)}`,
            sdkAuthError instanceof Error ? sdkAuthError : undefined,
          )
        }
      } else {
        // Handle other connection errors
        failConnection(`Failed to connect: ${errorInstance.message}`, errorInstance)
      }
      // Set connectingRef false only if not waiting for redirect
      if (state !== 'authenticating') {
        connectingRef.current = false
      }
    }
  }, [
    url,
    storageKeyPrefix,
    clientName,
    clientUri,
    callbackUrl,
    clientConfig, // Provider/Client configs
    addLog,
    failConnection,
    disconnect, // Core actions
    state,
    autoReconnect, // State/Config used in handlers
  ])

  const callTool = useCallback(
    async (name: string, args?: Record<string, unknown>) => {
      if (state !== 'ready' || !clientRef.current) {
        throw new Error(`MCP client is not ready (state: ${state}). Cannot call tool "${name}".`)
      }
      addLog('info', `Calling tool: ${name}`, args)
      try {
        const result = await clientRef.current.request({ method: 'tools/call', params: { name, arguments: args } }, CallToolResultSchema)
        addLog('info', `Tool "${name}" call successful:`, result)
        return result
      } catch (err) {
        addLog('error', `Error calling tool "${name}": ${err instanceof Error ? err.message : String(err)}`, err)
        // TODO: Check if error is UnauthorizedError and trigger re-authentication?
        if (
          err instanceof UnauthorizedError ||
          (err instanceof Error && (err.message.includes('Unauthorized') || err.message.includes('401')))
        ) {
          addLog('warn', 'Tool call unauthorized, attempting re-authentication...')
          setState('authenticating') // Signal auth needed
          // Don't disconnect, just trigger auth
          assert(authProviderRef.current, 'Auth Provider not available for tool re-auth')
          auth(authProviderRef.current, { serverUrl: url }).catch((sdkAuthError) => {
            failConnection(
              `Re-authentication failed: ${sdkAuthError instanceof Error ? sdkAuthError.message : String(sdkAuthError)}`,
              sdkAuthError instanceof Error ? sdkAuthError : undefined,
            )
          })
        }
        throw err
      }
    },
    [state, addLog, url], // Add url dependency for re-auth attempt
  )

  const retry = useCallback(() => {
    // Retry should attempt to connect again, regardless of the specific failure reason
    if (state === 'failed') {
      addLog('info', 'Retry requested...')
      // Reset state and attempt connection
      setState('discovering')
      setError(undefined)
      setAuthUrl(undefined)
      connect()
    } else {
      addLog('warn', `Retry called but state is not 'failed' (state: ${state}). Ignoring.`)
    }
  }, [state, addLog, connect])

  const authenticate = useCallback(() => {
    addLog('info', 'Manual authentication requested...')
    // Option 1: If failed, just retry connection which includes auth logic
    if (state === 'failed') {
      addLog('info', 'Attempting to reconnect and authenticate...')
      retry() // Retry will call connect()
    }
    // Option 2: If stuck authenticating (popup possibly blocked), maybe re-trigger
    else if (state === 'authenticating') {
      addLog('warn', 'Already attempting authentication. Check for blocked popups or wait for timeout.')
      // Optionally, try retrieving and setting the manual URL again
      const manualUrl = authProviderRef.current?.getLastAttemptedAuthUrl()
      if (manualUrl && !authUrl) {
        // Only set if not already set
        setAuthUrl(manualUrl)
        addLog('info', 'Manual authentication URL retrieved:', manualUrl)
      }
      // Maybe try calling SDK auth again? Could be risky if popup is open.
      // assert(authProviderRef.current, "Auth Provider not available for manual auth trigger");
      // auth(authProviderRef.current, { serverUrl: url }).catch(failConnection);
    }
    // Option 3: If already ready, maybe force a refresh/re-auth? Less common.
    else {
      addLog(
        'info',
        'Client not in a state requiring manual authentication trigger (state: ${state}). If needed, try disconnecting and reconnecting.',
      )
    }
  }, [state, addLog, retry, authUrl]) // Add authUrl

  const clearStorage = useCallback(() => {
    if (authProviderRef.current) {
      const count = authProviderRef.current.clearStorage()
      addLog('info', `Cleared ${count} item(s) from localStorage for ${url}.`)
      setAuthUrl(undefined) // Clear any displayed manual URL
      // Force disconnect and state reset as auth info is gone
      disconnect().then(() => {
        if (isMountedRef.current) {
          setState('discovering') // Ready for a fresh connect attempt
        }
      })
    } else {
      addLog('warn', 'Auth provider not initialized, cannot clear storage.')
    }
  }, [addLog, url, disconnect])

  // ===== Effects =====

  // Effect for handling auth callback messages from popup
  useEffect(() => {
    const messageHandler = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return

      if (event.data && event.data.type === 'mcp_auth_callback') {
        addLog('info', 'Received auth callback message.', event.data)
        if (authTimeoutRef.current) clearTimeout(authTimeoutRef.current) // Stop timeout

        if (event.data.success) {
          addLog('info', 'Authentication successful via popup. Reconnecting client...')
          // Tokens are saved by callback handler via provider.saveTokens.
          // Re-run connect() to establish the session with the new tokens.
          connectingRef.current = false // Allow connect again
          connect()
        } else {
          // Auth failed in the popup/callback handler
          failConnection(`Authentication failed in callback: ${event.data.error || 'Unknown reason.'}`)
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
  }, [addLog, failConnection, connect]) // connect needed for success path

  // Effect for initial connection
  useEffect(() => {
    isMountedRef.current = true
    addLog('debug', 'useMcp mounted, initiating connection.')
    connectAttemptRef.current = 0
    // Ensure provider exists before connecting
    if (!authProviderRef.current) {
      authProviderRef.current = new BrowserOAuthClientProvider(url, {
        storageKeyPrefix,
        clientName,
        clientUri,
        callbackUrl,
      })
      addLog('debug', 'BrowserOAuthClientProvider initialized on mount.')
    }
    connect() // Initial connection attempt

    return () => {
      isMountedRef.current = false
      addLog('debug', 'useMcp unmounting, disconnecting.')
      disconnect(true) // Quiet disconnect on unmount
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    url, // Reconnect if URL changes
    storageKeyPrefix,
    callbackUrl,
    clientName,
    clientUri, // Reconnect if provider config changes
    // connect, disconnect are stable due to useCallback
  ])

  // Effect for auto-retry logic
  useEffect(() => {
    let retryTimeoutId: number | null = null
    if (state === 'failed' && autoRetry && connectAttemptRef.current > 0) {
      const delay = typeof autoRetry === 'number' ? autoRetry : DEFAULT_RETRY_DELAY
      addLog('info', `Connection failed, auto-retrying in ${delay}ms...`)
      retryTimeoutId = setTimeout(() => {
        if (isMountedRef.current && state === 'failed') {
          retry()
        }
      }, delay)
    }
    return () => {
      if (retryTimeoutId) clearTimeout(retryTimeoutId)
    }
  }, [state, autoRetry, retry, addLog])

  return {
    state,
    tools,
    error,
    log,
    authUrl, // Expose the manually retrieved auth URL
    callTool,
    retry,
    disconnect,
    authenticate,
    clearStorage,
  }
}
