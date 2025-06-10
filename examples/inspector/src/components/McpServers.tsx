import { useState, useRef, useEffect } from 'react'
import { useMcp, type Tool } from 'use-mcp/react'


// MCP Connection wrapper that only renders when active
function McpConnection({
  serverUrl,
  onConnectionUpdate,
}: {
  serverUrl: string
  onConnectionUpdate: (data: any) => void
}) {
  // Use the MCP hook with the server URL
  const connection = useMcp({
    url: serverUrl,
    debug: true,
    autoRetry: false,
    popupFeatures: 'width=500,height=600,resizable=yes,scrollbars=yes',
  })

  // Update parent component with connection data
  useEffect(() => {
    onConnectionUpdate(connection)
  }, [
    connection.state,
    connection.tools,
    connection.error,
    connection.log.length,
    connection.authUrl,
  ])

  // Return null as this is just a hook wrapper
  return null
}

export function McpServers({
  onToolsUpdate,
}: {
  onToolsUpdate?: (tools: Tool[]) => void
}) {
  const [serverUrl, setServerUrl] = useState(() => {
    return sessionStorage.getItem('mcpServerUrl') || ''
  })
  const [isActive, setIsActive] = useState(false)

  const [connectionData, setConnectionData] = useState<any>({
    state: 'not-connected',
    tools: [],
    error: undefined,
    log: [],
    authUrl: undefined,
    retry: () => {},
    disconnect: () => {},
    authenticate: () => Promise.resolve(undefined),
    callTool: (_name: string, _args?: Record<string, unknown>) =>
      Promise.resolve(undefined),
    clearStorage: () => {},
  })
  const logRef = useRef<HTMLDivElement>(null)

  // Extract connection properties
  const { state, tools, error, log, authUrl, disconnect, authenticate } =
    connectionData

  // Notify parent component when tools change
  useEffect(() => {
    if (onToolsUpdate && tools.length > 0) {
      onToolsUpdate(
        tools.map((t: Tool) => ({
          ...t,
          callTool: (args: Record<string, unknown>) =>
            connectionData.callTool(t.name, args),
        })),
      )
    }
  }, [tools, onToolsUpdate])

  // Handle connection
  const handleConnect = () => {
    if (!serverUrl.trim()) return
    setIsActive(true)
  }

  // Handle disconnection
  const handleDisconnect = () => {
    disconnect()
    setIsActive(false)
    setConnectionData({
      state: 'not-connected',
      tools: [],
      error: undefined,
      log: [],
      authUrl: undefined,
      retry: () => {},
      disconnect: () => {},
      authenticate: () => Promise.resolve(undefined),
      callTool: (_name: string, _args?: Record<string, unknown>) =>
        Promise.resolve(undefined),
      clearStorage: () => {},
    })
  }

  // Handle authentication if popup was blocked
  const handleManualAuth = async () => {
    try {
      await authenticate()
    } catch (err) {
      console.error('Authentication error:', err)
    }
  }

  // Auto-scroll log to bottom
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [log])

  // Generate status badge based on connection state
  const getStatusBadge = () => {
    const baseClasses = 'px-2 py-1 rounded-full text-xs font-medium'

    switch (state) {
      case 'discovering':
        return (
          <span className={`${baseClasses} bg-blue-100 text-blue-800`}>
            Discovering
          </span>
        )
      case 'authenticating':
        return (
          <span className={`${baseClasses} bg-purple-100 text-purple-800`}>
            Authenticating
          </span>
        )
      case 'connecting':
        return (
          <span className={`${baseClasses} bg-yellow-100 text-yellow-800`}>
            Connecting
          </span>
        )
      case 'loading':
        return (
          <span className={`${baseClasses} bg-orange-100 text-orange-800`}>
            Loading
          </span>
        )
      case 'ready':
        return (
          <span className={`${baseClasses} bg-green-100 text-green-800`}>
            Connected
          </span>
        )
      case 'failed':
        return (
          <span className={`${baseClasses} bg-red-100 text-red-800`}>
            Failed
          </span>
        )
      case 'not-connected':
      default:
        return (
          <span className={`${baseClasses} bg-gray-100 text-gray-800`}>
            Not Connected
          </span>
        )
    }
  }

  // Log the tools to console when they change (for debugging)
  useEffect(() => {
    if (tools.length > 0) {
      console.log('MCP Tools available:', tools)
    }
  }, [tools])

  return (
    <section className="rounded-lg bg-white p-4 border border-zinc-200">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">MCP Servers</span>
        {getStatusBadge()}
      </div>

      <p className="text-gray-500 text-xs mt-1 mb-3">
        Connect to Model Context Protocol (MCP) servers to access additional AI
        capabilities.
      </p>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="font-medium text-xs">Status:</label>
          {getStatusBadge()}
        </div>



        <div className="flex gap-2">
          <input
            type="text"
            className="flex-1 p-2 border border-gray-200 rounded text-sm placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-300"
            placeholder="Enter MCP server URL"
            value={serverUrl}
            onChange={(e) => {
              const newValue = e.target.value
              setServerUrl(newValue)
              sessionStorage.setItem('mcpServerUrl', newValue)
            }}
            disabled={isActive && state !== 'failed'}
          />
          
          {state === 'ready' ||
          (isActive && state !== 'not-connected' && state !== 'failed') ? (
            <button
              className="px-4 py-2 bg-orange-100 hover:bg-orange-200 text-orange-900 rounded text-sm font-medium whitespace-nowrap"
              onClick={handleDisconnect}
            >
              Disconnect
            </button>
          ) : (
            <button
              className="bg-blue-600 hover:bg-blue-700 text-white rounded py-2 px-4 text-sm font-medium disabled:opacity-50 whitespace-nowrap"
              onClick={handleConnect}
              disabled={isActive || !serverUrl.trim()}
            >
              Connect
            </button>
          )}
        </div>

        {/* Authentication Link if needed */}
        {authUrl && (
          <div className="p-3 bg-orange-50 border border-orange-200 rounded">
            <p className="text-xs mb-2">
              Authentication required. Please click the link below:
            </p>
            <a
              href={authUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-orange-700 hover:text-orange-800 underline"
              onClick={handleManualAuth}
            >
              Authenticate in new window
            </a>
          </div>
        )}

        {/* Tools display when connected */}
        {state === 'ready' && tools.length > 0 && (
          <div>
            <h3 className="font-medium text-sm mb-3">
              Available Tools ({tools.length})
            </h3>
            <div className="border border-gray-200 rounded p-4 bg-gray-50 space-y-3">
              {tools.map((tool: Tool, index: number) => (
                <div
                  key={index}
                  className="bg-white p-3 rounded border border-gray-100 shadow-sm"
                >
                  <div className="font-mono font-medium text-sm text-blue-700">
                    {tool.name}
                  </div>
                  {tool.description && (
                    <p className="text-gray-600 mt-2 text-sm leading-relaxed">
                      {tool.description}
                    </p>
                  )}
                  {tool.inputSchema && (
                    <div className="mt-3 pt-2 border-t border-gray-100">
                      <div className="text-xs font-medium text-gray-700 mb-2">Parameters:</div>
                      <pre className="text-xs text-gray-600 bg-gray-50 p-2 rounded overflow-x-auto">
                        {JSON.stringify(tool.inputSchema, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Debug Log */}
        <div>
          <label className="font-medium text-xs block mb-2">Debug Log</label>
          <div
            ref={logRef}
            className="border border-gray-200 rounded p-2 bg-gray-50 h-32 overflow-y-auto font-mono text-xs"
          >
            {log.length > 0 ? (
              log.map((entry: any, index: number) => (
                <div
                  key={index}
                  className={`py-0.5 ${
                    entry.level === 'debug'
                      ? 'text-gray-500'
                      : entry.level === 'info'
                        ? 'text-blue-600'
                        : entry.level === 'warn'
                          ? 'text-orange-600'
                          : 'text-red-600'
                  }`}
                >
                  [{entry.level}] {entry.message}
                </div>
              ))
            ) : (
              <div className="text-gray-400">No log entries yet</div>
            )}
          </div>
          {connectionData?.state !== 'not-connected' && (
            <button
              onClick={() => {
                connectionData?.clearStorage()
                if (isActive) {
                  handleDisconnect()
                }
              }}
              className="text-xs text-orange-600 hover:text-orange-800 hover:underline mt-2"
            >
              Clear stored authentication
            </button>
          )}
        </div>
      </div>

      {/* Only render the actual MCP connection when active */}
      {isActive && (
        <McpConnection
          serverUrl={serverUrl}
          onConnectionUpdate={setConnectionData}
        />
      )}
    </section>
  )
}
