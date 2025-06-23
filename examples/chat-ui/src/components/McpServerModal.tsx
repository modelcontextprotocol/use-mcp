import React, { useState, useRef, useEffect } from 'react'
import { X, Info, Settings, Plus, Trash2, Power, PowerOff } from 'lucide-react'
import { useMcp, type Tool } from 'use-mcp/react'

interface McpServer {
  id: string
  url: string
  enabled: boolean
  name?: string
}

// MCP Connection wrapper for a single server
function McpConnection({
  server,
  onConnectionUpdate,
}: {
  server: McpServer
  onConnectionUpdate: (serverId: string, data: any) => void
}) {
  // Use the MCP hook with the server URL
  const connection = useMcp({
    url: server.url,
    debug: true,
    autoRetry: false,
    popupFeatures: 'width=500,height=600,resizable=yes,scrollbars=yes',
  })

  // Update parent component with connection data
  useEffect(() => {
    onConnectionUpdate(server.id, connection)
  }, [
    server.id,
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
  const [servers, setServers] = useState<McpServer[]>(() => {
    const stored = localStorage.getItem('mcpServers')
    return stored ? JSON.parse(stored) : []
  })
  const [newServerUrl, setNewServerUrl] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [connectionData, setConnectionData] = useState<Record<string, any>>({})
  const logRef = useRef<HTMLDivElement>(null)

  // Save servers to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('mcpServers', JSON.stringify(servers))
  }, [servers])

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

  // Aggregate all tools from enabled servers and notify parent
  useEffect(() => {
    const allTools: Tool[] = []
    
    servers.forEach(server => {
      if (server.enabled && connectionData[server.id]?.tools) {
        const serverTools = connectionData[server.id].tools.map((t: Tool) => ({
          ...t,
          callTool: (args: Record<string, unknown>) =>
            connectionData[server.id].callTool(t.name, args),
        }))
        allTools.push(...serverTools)
      }
    })

    if (onToolsUpdate) {
      onToolsUpdate(allTools)
    }
  }, [servers, connectionData, onToolsUpdate])

  // Handle adding a new server
  const handleAddServer = () => {
    if (!newServerUrl.trim()) return
    
    const newServer: McpServer = {
      id: Date.now().toString(),
      url: newServerUrl.trim(),
      enabled: true,
      name: new URL(newServerUrl.trim()).hostname
    }
    
    setServers(prev => [...prev, newServer])
    setNewServerUrl('')
  }

  // Handle removing a server
  const handleRemoveServer = (serverId: string) => {
    // Disconnect if connected
    const connection = connectionData[serverId]
    if (connection?.disconnect) {
      connection.disconnect()
    }
    
    setServers(prev => prev.filter(s => s.id !== serverId))
    setConnectionData(prev => {
      const newData = { ...prev }
      delete newData[serverId]
      return newData
    })
  }

  // Handle toggling server enabled state
  const handleToggleServer = (serverId: string) => {
    setServers(prev => prev.map(server => 
      server.id === serverId 
        ? { ...server, enabled: !server.enabled }
        : server
    ))
    
    // If disabling, disconnect
    const server = servers.find(s => s.id === serverId)
    if (server?.enabled && connectionData[serverId]?.disconnect) {
      connectionData[serverId].disconnect()
    }
  }

  // Handle connection update for a specific server
  const handleConnectionUpdate = (serverId: string, data: any) => {
    setConnectionData(prev => ({
      ...prev,
      [serverId]: data
    }))
  }

  // Handle authentication for a specific server
  const handleManualAuth = async (serverId: string) => {
    try {
      const connection = connectionData[serverId]
      if (connection?.authenticate) {
        await connection.authenticate()
      }
    } catch (err) {
      console.error('Authentication error:', err)
    }
  }

  // Generate status badge based on connection state
  const getStatusBadge = (state: string) => {
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
      <div 
        className={`fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4 ${isOpen ? 'block' : 'hidden'}`}
        onClick={onClose}
      >
        <div 
          className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[80vh] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between p-6 border-b border-zinc-200">
            <h2 className="text-xl font-semibold text-zinc-900">MCP Servers</h2>
            <div className="flex items-center gap-2">
              <button
                className="rounded-md border border-gray-200 p-1 hover:bg-gray-50"
                onClick={() => setShowSettings(!showSettings)}
              >
                <Settings size={16} className="text-gray-500" />
              </button>
              <button
                onClick={onClose}
                className="text-zinc-400 hover:text-zinc-600 p-1 cursor-pointer"
              >
                <X size={24} />
              </button>
            </div>
          </div>
          
          <div className="p-6 overflow-y-auto max-h-[60vh]">
            <div className="flex items-center mb-6">
              <Info size={16} className="text-gray-400 mr-2" />
              <span className="text-sm text-gray-600">
                Connect to Model Context Protocol (MCP) servers to access additional AI capabilities.
              </span>
            </div>

            {/* Server List */}
            <div className="space-y-4 mb-6">
              {servers.map((server) => {
                const connection = connectionData[server.id] || { state: 'not-connected', tools: [], error: undefined, authUrl: undefined }
                const { state, tools, error, authUrl } = connection
                
                return (
                  <div
                    key={server.id}
                    className={`border rounded-lg p-4 ${server.enabled ? 'border-zinc-200' : 'border-zinc-100 bg-zinc-50'}`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div>
                          <div className="font-medium text-zinc-900">{server.name || 'MCP Server'}</div>
                          <div className="text-sm text-zinc-500 break-all">{server.url}</div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {getStatusBadge(server.enabled ? state : 'disabled')}
                        <button
                          onClick={() => handleToggleServer(server.id)}
                          className={`p-1 rounded ${server.enabled ? 'text-green-600 hover:bg-green-50' : 'text-gray-400 hover:bg-gray-50'}`}
                          title={server.enabled ? 'Disable server' : 'Enable server'}
                        >
                          {server.enabled ? <Power size={16} /> : <PowerOff size={16} />}
                        </button>
                        <button
                          onClick={() => handleRemoveServer(server.id)}
                          className="p-1 text-red-500 hover:bg-red-50 rounded"
                          title="Delete server"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>

                    {server.enabled && (
                      <>
                        {error && state === 'failed' && (
                          <div className="text-sm text-red-600 p-3 bg-red-50 rounded border mb-3">
                            {error}
                          </div>
                        )}

                        {authUrl && (
                          <div className="p-3 bg-orange-50 border border-orange-200 rounded mb-3">
                            <p className="text-sm mb-2">
                              Authentication required. Please click the link below:
                            </p>
                            <a
                              href={authUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-orange-700 hover:text-orange-800 underline"
                              onClick={() => handleManualAuth(server.id)}
                            >
                              Authenticate in new window
                            </a>
                          </div>
                        )}

                        {state === 'ready' && tools.length > 0 && (
                          <div>
                            <h4 className="font-medium text-sm mb-2">
                              Available Tools ({tools.length})
                            </h4>
                            <div className="border border-gray-200 rounded p-2 bg-gray-50 max-h-24 overflow-y-auto space-y-1">
                              {tools.map((tool: Tool, index: number) => (
                                <div key={index} className="text-xs">
                                  <span className="font-medium">{tool.name}</span>
                                  {tool.description && (
                                    <span className="text-gray-600 ml-2">- {tool.description}</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )
              })}

              {servers.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <Info size={24} className="mx-auto mb-2" />
                  <p>No MCP servers configured yet.</p>
                  <p className="text-sm">Add your first server below.</p>
                </div>
              )}
            </div>

            {/* Add New Server */}
            <div className="border-t pt-4">
              <h3 className="font-medium text-sm mb-3">Add New Server</h3>
              <div className="flex gap-2">
                <input
                  type="text"
                  className="flex-1 p-3 border border-gray-200 rounded-lg text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter MCP server URL"
                  value={newServerUrl}
                  onChange={(e) => setNewServerUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleAddServer()
                    }
                  }}
                />
                <button
                  className="px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 flex items-center gap-2"
                  onClick={handleAddServer}
                  disabled={!newServerUrl.trim()}
                >
                  <Plus size={16} />
                  Add
                </button>
              </div>
            </div>

            {/* Debug Info */}
            {showSettings && (
              <div className="border-t pt-4 mt-4">
                <h3 className="font-medium text-sm mb-3">Debug Information</h3>
                <div className="text-xs space-y-2">
                  <div>Total Servers: {servers.length}</div>
                  <div>Enabled Servers: {servers.filter(s => s.enabled).length}</div>
                  <div>Connected Servers: {Object.values(connectionData).filter((c: any) => c.state === 'ready').length}</div>
                  <div>Total Tools: {Object.values(connectionData).reduce((sum: number, c: any) => sum + (c.tools?.length || 0), 0)}</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Render MCP connections for all enabled servers */}
      {servers.filter(s => s.enabled).map(server => (
        <McpConnection
          key={server.id}
          server={server}
          onConnectionUpdate={handleConnectionUpdate}
        />
      ))}
    </>
  )
}

export default McpServerModal
