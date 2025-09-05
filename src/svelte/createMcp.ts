import { readable, type Readable } from 'svelte/store'
import {
  CallToolResultSchema,
  JSONRPCMessage,
  ListToolsResultSchema,
  ListResourcesResultSchema,
  ReadResourceResultSchema,
  ListPromptsResultSchema,
  GetPromptResultSchema,
  type Resource,
  type ResourceTemplate,
  type Prompt,
} from '@modelcontextprotocol/sdk/types.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { auth, UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import { sanitizeUrl } from 'strict-url-sanitise'

import { BrowserOAuthClientProvider } from '../auth/browser-provider.js'
import { assert } from '../utils/assert.js'
import type { UseMcpOptions, UseMcpResult } from '../react/types.js'

const DEFAULT_RECONNECT_DELAY = 3000
const DEFAULT_RETRY_DELAY = 5000
const AUTH_TIMEOUT = 5 * 60 * 1000
type TransportType = 'http' | 'sse'

/**
 * Factory returning a Svelte store whose value mirrors UseMcpResult.
 * Methods are exposed on the returned object alongside the `subscribe` method.
 */
export function createMcp(options: UseMcpOptions): Readable<UseMcpResult> & Omit<UseMcpResult, keyof any> & {
  // Explicit methods to help inference when consuming
  callTool: UseMcpResult['callTool']
  listResources: UseMcpResult['listResources']
  readResource: UseMcpResult['readResource']
  listPrompts: UseMcpResult['listPrompts']
  getPrompt: UseMcpResult['getPrompt']
  retry: UseMcpResult['retry']
  disconnect: UseMcpResult['disconnect']
  authenticate: UseMcpResult['authenticate']
  clearStorage: UseMcpResult['clearStorage']
} {
  const {
    url,
    clientName,
    clientUri,
    callbackUrl = typeof window !== 'undefined'
      ? sanitizeUrl(new URL('/oauth/callback', window.location.origin).toString())
      : '/oauth/callback',
    storageKeyPrefix = 'mcp:auth',
    clientConfig = {},
    customHeaders = {},
    debug = false,
    autoRetry = false,
    autoReconnect = DEFAULT_RECONNECT_DELAY,
    transportType = 'auto',
    preventAutoAuth = false,
    onPopupWindow,
    allowedOrigins = [],
  } = options

  // --- Internal mutable refs (not reactive) ---
  const serverUrl = new URL(sanitizeUrl(url)).toString()
  let client: Client | null = null
  let transport: Transport | null = null
  let authProvider: BrowserOAuthClientProvider | null = null
  let connecting = false
  let isMounted = false
  let connectAttempt = 0
  let authTimeout: ReturnType<typeof setTimeout> | null = null
  let autoRetryTimer: ReturnType<typeof setTimeout> | null = null
  let autoReconnectRef: boolean | number = autoReconnect
  let stateRef: UseMcpResult['state'] = 'discovering'
  let successfulTransportRef: TransportType | null = null

  // --- Helper: build initial value ---
  const initialValue: UseMcpResult = {
    state: 'discovering',
    tools: [],
    resources: [],
    resourceTemplates: [],
    prompts: [],
    error: undefined,
    authUrl: undefined,
    log: [],
    // Placeholder methods; replaced after store creation to capture `set`
    callTool: async () => { throw new Error('MCP client not ready') },
    listResources: async () => { throw new Error('MCP client not ready') },
    readResource: async () => { throw new Error('MCP client not ready') },
    listPrompts: async () => { throw new Error('MCP client not ready') },
    getPrompt: async () => { throw new Error('MCP client not ready') },
    retry: () => {},
    disconnect: () => {},
    authenticate: () => {},
    clearStorage: () => {},
  }

  // Local mutable snapshot of the value we publish to subscribers
  let current: UseMcpResult = { ...initialValue }

  // --- Logging ---
  function addLog(level: UseMcpResult['log'][number]['level'], message: string, ...args: unknown[]) {
    if (level === 'debug' && !debug) return
    const fullMessage = args.length > 0 ? `${message} ${args.map((arg) => safeStringify(arg)).join(' ')}` : message
    try { console[level](`[useMcp] ${fullMessage}`) } catch {}
    if (!isMounted) return
    const log = [...current.log.slice(-100), { level, message: fullMessage, timestamp: Date.now() }]
    setValue({ log })
  }

  function safeStringify(v: unknown): string {
    try { return JSON.stringify(v) } catch { return String(v) }
  }

  function setValue(patch: Partial<UseMcpResult>) {
    current = { ...current, ...patch }
    // Keep stateRef in sync whenever state is updated via setValue
    if (typeof patch.state !== 'undefined') {
      stateRef = patch.state as UseMcpResult['state']
      scheduleAutoRetryIfNeeded()
    }
    set(current)
  }

  function setState(state: UseMcpResult['state']) {
    stateRef = state
    setValue({ state })
    scheduleAutoRetryIfNeeded()
  }

  function clearAuthTimeout() {
    if (authTimeout) { clearTimeout(authTimeout); authTimeout = null }
  }

  async function doDisconnect(quiet = false) {
    if (!quiet) addLog('info', 'Disconnecting...')
    connecting = false
    clearAuthTimeout()
    const t = transport
    client = null
    transport = null
    if (isMounted && !quiet) {
      setValue({
        state: 'discovering',
        tools: [], resources: [], resourceTemplates: [], prompts: [],
        error: undefined, authUrl: undefined,
      })
    }
    if (t) {
      try { await t.close(); if (!quiet) addLog('debug', 'Transport closed') } catch (e) { if (!quiet) addLog('warn', 'Error closing transport:', e as Error) }
    }
  }

  function scheduleAutoRetryIfNeeded() {
    if (autoRetryTimer) { clearTimeout(autoRetryTimer); autoRetryTimer = null }
    if (stateRef === 'failed' && autoRetry && connectAttempt > 0) {
      const delay = typeof autoRetry === 'number' ? autoRetry : DEFAULT_RETRY_DELAY
      addLog('info', `Connection failed, auto-retrying in ${delay}ms...`)
      autoRetryTimer = setTimeout(() => {
        if (isMounted && stateRef === 'failed') {
          retry()
        }
      }, delay)
    }
  }

  function failConnection(errorMessage: string, connectionError?: Error) {
    addLog('error', errorMessage, connectionError ?? '')
    if (isMounted) {
      setValue({ state: 'failed', error: errorMessage })
      const manualUrl = authProvider?.getLastAttemptedAuthUrl() || undefined
      if (manualUrl) {
        setValue({ authUrl: manualUrl })
        addLog('info', 'Manual authentication URL may be available.', manualUrl)
      }
    }
    connecting = false
  }

  async function connect() {
    if (connecting) { addLog('debug', 'Connection attempt already in progress.'); return }
    if (!isBrowser()) { addLog('debug', 'Not in browser; skipping connect.'); return }
    if (!isMounted) { addLog('debug', 'Connect called before mount; aborting.'); return }

    connecting = true
    connectAttempt += 1
    successfulTransportRef = null
    setValue({ error: undefined, authUrl: undefined })
    setState('discovering')
    addLog('info', `Connecting attempt #${connectAttempt} to ${serverUrl}...`)

    // init provider/client
    if (!authProvider) {
      authProvider = new BrowserOAuthClientProvider(serverUrl, {
        storageKeyPrefix,
        clientName,
        clientUri,
        callbackUrl,
        preventAutoAuth,
        onPopupWindow,
      })
      addLog('debug', 'BrowserOAuthClientProvider initialized in connect.')
    }
    if (!client) {
      client = new Client({ name: clientConfig.name || 'use-mcp-svelte-client', version: clientConfig.version || '0.1.0' }, { capabilities: {} })
      addLog('debug', 'MCP Client initialized in connect.')
    }

    const tryConnectWithTransport = async (kind: TransportType): Promise<'success' | 'auth_redirect' | 'failed'> => {
      addLog('info', `Attempting connection with ${kind.toUpperCase()} transport...`)
      if (stateRef !== 'authenticating') setState('connecting')

      let transportInstance: Transport
      try {
        assert(authProvider, 'Auth Provider must be initialized')
        assert(client, 'Client must be initialized')
        if (transport) {
          await transport.close().catch((e: any) => addLog('warn', `Error closing previous transport: ${(e as Error)?.message || e}`))
          transport = null
        }

        const baseOpts = { authProvider } as const
        const targetUrl = new URL(serverUrl)
        addLog('debug', `Creating ${kind.toUpperCase()} transport for URL: ${targetUrl.toString()}`)

        if (kind === 'http') {
          addLog('debug', 'Creating StreamableHTTPClientTransport...')
          transportInstance = new StreamableHTTPClientTransport(targetUrl, {
            ...baseOpts,
            requestInit: { headers: { ...customHeaders } },
          })
        } else {
          addLog('debug', 'Creating SSEClientTransport...')
          transportInstance = new SSEClientTransport(targetUrl, {
            ...baseOpts,
            requestInit: { headers: { Accept: 'text/event-stream', ...customHeaders } },
          })
        }
        transport = transportInstance
      } catch (err) {
        failConnection(`Failed to create ${kind.toUpperCase()} transport: ${err instanceof Error ? err.message : String(err)}`,
          err instanceof Error ? err : undefined)
        return 'failed'
      }

      transportInstance.onmessage = (message: JSONRPCMessage) => {
        addLog('debug', `[Transport] Received: ${safeStringify(message)}`)
        // @ts-ignore
        client?.handleMessage?.(message)
      }
      transportInstance.onerror = (err: Error) => {
        addLog('warn', `Transport error event (${kind.toUpperCase()}):`, err)
        failConnection(`Transport error (${kind.toUpperCase()}): ${err.message}`, err)
      }
      transportInstance.onclose = () => {
        if (!isMounted || connecting) return
        addLog('info', `Transport connection closed (${successfulTransportRef || 'unknown'} type).`)
        const currentState = stateRef
        const ar = autoReconnectRef
        if (currentState === 'ready' && ar) {
          const delay = typeof ar === 'number' ? ar : DEFAULT_RECONNECT_DELAY
          addLog('info', `Attempting to reconnect in ${delay}ms...`)
          setState('connecting')
          setTimeout(() => { if (isMounted) connect() }, delay)
        } else if (currentState !== 'failed' && currentState !== 'authenticating') {
          failConnection('Connection closed unexpectedly.')
        }
      }

      try {
        addLog('info', `Connecting client via ${kind.toUpperCase()}...`)
        await client!.connect(transportInstance)
        addLog('info', `Client connected via ${kind.toUpperCase()}. Loading tools, resources, and prompts...`)
        successfulTransportRef = kind
        setState('loading')

        const toolsResponse = await client!.request({ method: 'tools/list' }, ListToolsResultSchema)
        let resourcesResponse: { resources: Resource[]; resourceTemplates?: ResourceTemplate[] } = { resources: [], resourceTemplates: [] }
        try { resourcesResponse = await client!.request({ method: 'resources/list' }, ListResourcesResultSchema) } catch (e) { addLog('debug', 'Server does not support resources/list method', e as Error) }
        let promptsResponse: { prompts: Prompt[] } = { prompts: [] }
        try { promptsResponse = await client!.request({ method: 'prompts/list' }, ListPromptsResultSchema) } catch (e) { addLog('debug', 'Server does not support prompts/list method', e as Error) }

        if (isMounted) {
          setValue({
            tools: toolsResponse.tools,
            resources: resourcesResponse.resources,
            resourceTemplates: Array.isArray(resourcesResponse.resourceTemplates) ? resourcesResponse.resourceTemplates : [],
            prompts: promptsResponse.prompts,
            state: 'ready',
          })
          addLog('info', `Ready. Tools: ${toolsResponse.tools.length}, Resources: ${resourcesResponse.resources.length}, Prompts: ${promptsResponse.prompts.length}`)
        }
        return 'success'
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err)
        const errorInstance = err instanceof Error ? err : new Error(String(err))
        addLog('warn', `Error during connect (${kind.toUpperCase()}): ${errorMessage}`)

        if (
          errorInstance instanceof UnauthorizedError ||
          errorMessage.includes('Unauthorized') || errorMessage.includes('401')
        ) {
          if (preventAutoAuth) {
            setState('pending_auth')
            try {
              assert(authProvider, 'Auth Provider must be initialized')
              const authUrl = await authProvider.prepareAuthorizationUrl(new URL('about:blank'))
              setValue({ authUrl })
              addLog('info', 'Authentication required. Manual URL prepared (preventAutoAuth=true).')
              return 'failed'
            } catch (prepErr) {
              failConnection(`Failed to prepare authorization URL: ${prepErr instanceof Error ? prepErr.message : String(prepErr)}`,
                prepErr instanceof Error ? prepErr : undefined)
              return 'failed'
            }
          }

          setState('authenticating')
          clearAuthTimeout()
          authTimeout = setTimeout(() => {
            if (!isMounted) return
            failConnection('Authentication timed out. Please try again.')
          }, AUTH_TIMEOUT)

          try {
            assert(authProvider, 'Auth Provider must be initialized')
            const authResult = await auth(authProvider, { serverUrl })
            if (!isMounted) return 'failed'
            if (authResult === 'AUTHORIZED') {
              addLog('info', 'Authentication successful. Re-attempting connection...')
              clearAuthTimeout()
              connecting = false
              connect()
              return 'failed'
            } else if (authResult === 'REDIRECT') {
              addLog('info', 'Redirecting for authentication. Waiting for callback...')
              return 'auth_redirect'
            }
          } catch (sdkAuthError) {
            if (!isMounted) return 'failed'
            clearAuthTimeout()
            failConnection(`Failed to initiate authentication: ${sdkAuthError instanceof Error ? sdkAuthError.message : String(sdkAuthError)}`,
              sdkAuthError instanceof Error ? sdkAuthError : undefined)
            return 'failed'
          }
        }

        failConnection(`Failed to connect via ${kind.toUpperCase()}: ${errorMessage}`, errorInstance)
        return 'failed'
      }
    }

    let finalStatus: 'success' | 'auth_redirect' | 'failed' = 'failed'
    if (transportType === 'sse') {
      finalStatus = await tryConnectWithTransport('sse')
    } else if (transportType === 'http') {
      finalStatus = await tryConnectWithTransport('http')
    } else {
      const httpResult = await tryConnectWithTransport('http')
      if (httpResult !== 'success' && httpResult !== 'auth_redirect') {
        addLog('info', 'HTTP connect failed; attempting SSE fallback...')
        finalStatus = await tryConnectWithTransport('sse')
      } else {
        finalStatus = httpResult
      }
    }

    if (finalStatus === 'success' || finalStatus === 'failed') connecting = false
    addLog('debug', `Connection sequence finished with status: ${finalStatus}`)
  }

  async function callTool(name: string, args?: Record<string, unknown>) {
    if (stateRef !== 'ready' || !client) {
      throw new Error(`MCP client is not ready (current state: ${current.state}). Cannot call tool "${name}".`)
    }
    addLog('info', `Calling tool: ${name}`, args)
    try {
      const result = await client.request({ method: 'tools/call', params: { name, arguments: args } }, CallToolResultSchema)
      addLog('info', `Tool "${name}" call successful.`)
      return result
    } catch (err) {
      addLog('error', `Error calling tool "${name}": ${err instanceof Error ? err.message : String(err)}`, err as Error)
      const errorInstance = err instanceof Error ? err : new Error(String(err))
      if (
        errorInstance instanceof UnauthorizedError ||
        errorInstance.message.includes('Unauthorized') ||
        errorInstance.message.includes('401')
      ) {
        addLog('warn', 'Tool call unauthorized, attempting re-authentication...')
        setState('authenticating')
        clearAuthTimeout()
        authTimeout = setTimeout(() => {
          if (!isMounted) return
          failConnection('Authentication timed out. Please try again.')
        }, AUTH_TIMEOUT)
        try {
          assert(authProvider, 'Auth Provider not available for tool re-auth')
          const authResult = await auth(authProvider, { serverUrl })
          if (!isMounted) return
          if (authResult === 'AUTHORIZED') {
            addLog('info', 'Re-authentication successful. Reconnecting...')
            clearAuthTimeout()
            connecting = false
            connect()
          } else if (authResult === 'REDIRECT') {
            addLog('info', 'Redirecting for re-authentication for tool call.')
          }
        } catch (sdkAuthError) {
          if (!isMounted) return
          clearAuthTimeout()
          failConnection(`Re-authentication failed: ${sdkAuthError instanceof Error ? sdkAuthError.message : String(sdkAuthError)}`,
            sdkAuthError instanceof Error ? sdkAuthError : undefined)
        }
      }
      if (current.state !== 'authenticating') throw err as any
      return undefined as any
    }
  }

  async function listResources() {
    if (stateRef !== 'ready' || !client) {
      throw new Error(`MCP client is not ready (current state: ${current.state}). Cannot list resources.`)
    }
    addLog('info', 'Listing resources...')
    try {
      const resourcesResponse = await client.request({ method: 'resources/list' }, ListResourcesResultSchema)
      if (isMounted) {
        setValue({
          resources: resourcesResponse.resources,
          resourceTemplates: Array.isArray(resourcesResponse.resourceTemplates) ? resourcesResponse.resourceTemplates : [],
        })
        addLog('info', `Listed ${resourcesResponse.resources.length} resources, ${Array.isArray(resourcesResponse.resourceTemplates) ? resourcesResponse.resourceTemplates.length : 0} resource templates.`)
      }
    } catch (err) {
      addLog('error', `Error listing resources: ${err instanceof Error ? err.message : String(err)}`, err as Error)
      throw err
    }
  }

  async function readResource(uri: string) {
    if (stateRef !== 'ready' || !client) {
      throw new Error(`MCP client is not ready (current state: ${current.state}). Cannot read resource "${uri}".`)
    }
    addLog('info', `Reading resource: ${uri}`)
    try {
      const result = await client.request({ method: 'resources/read', params: { uri } }, ReadResourceResultSchema)
      addLog('info', `Resource "${uri}" read successfully`)
      return result
    } catch (err) {
      addLog('error', `Error reading resource "${uri}": ${err instanceof Error ? err.message : String(err)}`, err as Error)
      throw err
    }
  }

  async function listPrompts() {
    if (stateRef !== 'ready' || !client) {
      throw new Error(`MCP client is not ready (current state: ${current.state}). Cannot list prompts.`)
    }
    addLog('info', 'Listing prompts...')
    try {
      const promptsResponse = await client.request({ method: 'prompts/list' }, ListPromptsResultSchema)
      if (isMounted) {
        setValue({ prompts: promptsResponse.prompts })
        addLog('info', `Listed ${promptsResponse.prompts.length} prompts.`)
      }
    } catch (err) {
      addLog('error', `Error listing prompts: ${err instanceof Error ? err.message : String(err)}`, err as Error)
      throw err
    }
  }

  async function getPrompt(name: string, args?: Record<string, string>) {
    if (stateRef !== 'ready' || !client) {
      throw new Error(`MCP client is not ready (current state: ${current.state}). Cannot get prompt "${name}".`)
    }
    addLog('info', `Getting prompt: ${name}`, args)
    try {
      const result = await client.request({ method: 'prompts/get', params: { name, arguments: args } }, GetPromptResultSchema)
      addLog('info', `Prompt "${name}" retrieved successfully`)
      return result
    } catch (err) {
      addLog('error', `Error getting prompt "${name}": ${err instanceof Error ? err.message : String(err)}`, err as Error)
      throw err
    }
  }

  function retry() {
    if (stateRef === 'failed') {
      addLog('info', 'Retry requested...')
      connect()
    } else {
      addLog('warn', `Retry called but state is not 'failed' (state: ${stateRef}). Ignoring.`)
    }
  }

  async function authenticate() {
    addLog('info', 'Manual authentication requested...')
    const s = stateRef
    if (s === 'failed') {
      addLog('info', 'Attempting to reconnect and authenticate via retry...')
      retry()
    } else if (s === 'pending_auth') {
      setState('authenticating')
      clearAuthTimeout()
      authTimeout = setTimeout(() => {
        if (!isMounted) return
        failConnection('Authentication timed out. Please try again.')
      }, AUTH_TIMEOUT)
      try {
        assert(authProvider, 'Auth Provider not available for manual auth')
        const authResult = await auth(authProvider, { serverUrl })
        if (!isMounted) return
        if (authResult === 'AUTHORIZED') {
          addLog('info', 'Manual authentication successful. Re-attempting connection...')
          clearAuthTimeout()
          connecting = false
          connect()
        } else if (authResult === 'REDIRECT') {
          addLog('info', 'Redirecting for manual authentication. Waiting for callback...')
        }
      } catch (authError) {
        if (!isMounted) return
        clearAuthTimeout()
        failConnection(`Manual authentication failed: ${authError instanceof Error ? authError.message : String(authError)}`,
          authError instanceof Error ? authError : undefined)
      }
    } else if (s === 'authenticating') {
      addLog('warn', 'Already attempting authentication.')
    } else if (s === 'ready') {
      addLog('info', 'Already authenticated and connected.')
    } else {
      addLog('warn', `Authentication requested in state ${s}. Will attempt connect -> auth.`)
      connect()
    }
  }

  function clearStorage() {
    if (authProvider) {
      const count = authProvider.clearStorage()
      addLog('info', `Cleared ${count} item(s) from localStorage for ${serverUrl}.`)
      setValue({ authUrl: undefined })
      doDisconnect()
    } else {
      addLog('warn', 'Auth provider not initialized, cannot clear storage.')
    }
  }

  // Store start/stop lifecycle — start when there is at least one subscriber
  let set: (v: UseMcpResult) => void
  const store = readable<UseMcpResult>(initialValue, (start) => {
    set = start
    isMounted = true
    autoReconnectRef = autoReconnect
    addLog('debug', 'createMcp mounted, initiating connection.')
    connectAttempt = 0

    // Initialize/refresh provider on mount/options change
    if (isBrowser()) {
      if (!authProvider || authProvider.serverUrl !== serverUrl) {
        authProvider = new BrowserOAuthClientProvider(serverUrl, {
          storageKeyPrefix,
          clientName,
          clientUri,
          callbackUrl,
          preventAutoAuth,
          onPopupWindow,
        })
        addLog('debug', 'BrowserOAuthClientProvider initialized/updated on mount.')
      }
      // Auth callback listener
      const messageHandler = (event: MessageEvent) => {
        if (event.origin !== window.location.origin && !allowedOrigins.includes(event.origin)) return
        const t = (event as any)?.data?.type
        if (t === 'mcp_auth_callback' || t === 'mcp:oauthCallback') {
          addLog('info', 'Received auth callback message.', event.data)
          clearAuthTimeout()
          if (event.data.success) {
            addLog('info', 'Authentication successful via popup. Reconnecting client...')
            connecting = false
            connect()
          } else {
            failConnection(`Authentication failed in callback: ${event.data.error || 'Unknown reason.'}`)
          }
        }
      }
      window.addEventListener('message', messageHandler)

      // Kick off connection
      connect()

      return () => {
        window.removeEventListener('message', messageHandler)
        isMounted = false
        clearAuthTimeout()
        if (autoRetryTimer) { clearTimeout(autoRetryTimer); autoRetryTimer = null }
        void doDisconnect(true)
      }
    }

    // SSR: no lifecycle, just noop stop
    return () => {
      isMounted = false
    }
  }) as Readable<UseMcpResult> & any

  // Attach methods to the store object
  Object.assign(store, {
    callTool,
    listResources,
    readResource,
    listPrompts,
    getPrompt,
    retry,
    disconnect: () => { void doDisconnect() },
    authenticate: () => { void authenticate() },
    clearStorage,
  })

  // Also attach methods to the current snapshot so $mcp.callTool works
  Object.assign(current, {
    callTool,
    listResources,
    readResource,
    listPrompts,
    getPrompt,
    retry,
    disconnect: () => { void doDisconnect() },
    authenticate: () => { void authenticate() },
    clearStorage,
  })

  return store
}

function isBrowser() {
  return typeof window !== 'undefined' && typeof document !== 'undefined'
}
