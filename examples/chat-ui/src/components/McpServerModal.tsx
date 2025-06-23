import React, { useState, useRef, useEffect } from 'react'
import { X, Info, Settings } from 'lucide-react'
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

interface McpServerModalProps {
  isOpen: boolean
  onClose: () => void
  onToolsUpdate?: (tools: Tool[]) => void
}

const McpServerModal: React.FC<McpServerModalProps> = ({
  isOpen,
  onClose,
  onToolsUpdate,
}) => {
  const [serverUrl, setServerUrl] = useState(() => {
    return sessionStorage.getItem('mcpServerUrl') || ''
  })
  const [isActive, setIsActive] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
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

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

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

  return (
    <>
      <div className={`fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4 ${isOpen ? 'block' : 'hidden'}`}>
        <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden">
          <div className="flex items-center justify-between p-6 border-b border-zinc-200">
            <h2 className="text-xl font-semibold text-zinc-900">MCP Servers</h2>
            <button
              onClick={onClose}
              className="text-zinc-400 hover:text-zinc-600 p-1"
            >
              <X size={24} />
            </button>
          </div>
          
          <div className="p-6 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center">
                <Info size={16} className="text-gray-400 mr-2" />
                <span className="text-sm text-gray-600">
                  Connect to Model Context Protocol (MCP) servers to access additional AI capabilities.
                </span>
              </div>
              <button
                className="rounded-md border border-gray-200 p-1 hover:bg-gray-50"
                onClick={() => setShowSettings(!showSettings)}
              >
                <Settings size={16} className="text-gray-500" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="font-medium text-sm">Status:</label>
                {getStatusBadge()}
              </div>

              {error && state === 'failed' && (
                <div className="text-sm text-red-600 p-3 bg-red-50 rounded border">
                  {error}
                </div>
              )}

              <div className="space-y-3">
                <input
                  type="text"
                  className="w-full p-3 border border-gray-200 rounded-lg text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                    className="w-full px-4 py-3 bg-orange-100 hover:bg-orange-200 text-orange-900 rounded-lg text-sm font-medium"
                    onClick={handleDisconnect}
                  >
                    Disconnect
                  </button>
                ) : (
                  <button
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-3 px-4 text-sm font-medium disabled:opacity-50"
                    onClick={handleConnect}
                    disabled={isActive || !serverUrl.trim()}
                  >
                    Connect
                  </button>
                )}
              </div>

              {/* Authentication Link if needed */}
              {authUrl && (
                <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
                  <p className="text-sm mb-2">
                    Authentication required. Please click the link below:
                  </p>
                  <a
                    href={authUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-orange-700 hover:text-orange-800 underline"
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
                  <div className="border border-gray-200 rounded-lg p-3 bg-gray-50 max-h-40 overflow-y-auto space-y-3">
                    {tools.map((tool: Tool, index: number) => (
                      <div
                        key={index}
                        className="text-sm pb-3 border-b border-gray-200 last:border-b-0"
                      >
                        <span className="font-medium">{tool.name}</span>
                        {tool.description && (
                          <p className="text-gray-600 mt-1 text-sm">
                            {tool.description}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Debug Log */}
              {showSettings && (
                <div>
                  <label className="font-medium text-sm block mb-3">Debug Log</label>
                  <div
                    ref={logRef}
                    className="border border-gray-200 rounded-lg p-3 bg-gray-50 h-40 overflow-y-auto font-mono text-xs"
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
                      className="text-sm text-orange-600 hover:text-orange-800 hover:underline mt-2"
                    >
                      Clear stored authentication
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Only render the actual MCP connection when active */}
      {isActive && (
        <McpConnection
          serverUrl={serverUrl}
          onConnectionUpdate={setConnectionData}
        />
      )}
    </>
  )
}

export default McpServerModal
