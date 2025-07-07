import { useState, useRef, useEffect } from 'react'
import { useMcp, type Tool, type Resource, type ResourceTemplate, type Prompt } from 'use-mcp/react'
import { Info, X, ChevronRight, ChevronDown, FileText, MessageSquare } from 'lucide-react'

// MCP Connection wrapper that only renders when active
function McpConnection({
  serverUrl,
  transportType,
  onConnectionUpdate,
}: {
  serverUrl: string
  transportType: 'auto' | 'http' | 'sse'
  onConnectionUpdate: (data: any) => void
}) {
  // Use the MCP hook with the server URL
  const connection = useMcp({
    url: serverUrl,
    debug: true,
    autoRetry: false,
    popupFeatures: 'width=500,height=600,resizable=yes,scrollbars=yes',
    transportType,
  })

  // Update parent component with connection data
  useEffect(() => {
    onConnectionUpdate(connection)
  }, [
    connection.state,
    connection.tools,
    connection.resources,
    connection.resourceTemplates,
    connection.prompts,
    connection.error,
    connection.log.length,
    connection.authUrl,
  ])

  // Return null as this is just a hook wrapper
  return null
}

export function McpServers({ onToolsUpdate }: { onToolsUpdate?: (tools: Tool[]) => void }) {
  const [serverUrl, setServerUrl] = useState(() => {
    return sessionStorage.getItem('mcpServerUrl') || ''
  })
  const [transportType, setTransportType] = useState<'auto' | 'http' | 'sse'>(() => {
    return (sessionStorage.getItem('mcpTransportType') as 'auto' | 'http' | 'sse') || 'auto'
  })
  const [isActive, setIsActive] = useState(false)

  const [connectionData, setConnectionData] = useState<any>({
    state: 'not-connected',
    tools: [],
    resources: [],
    resourceTemplates: [],
    prompts: [],
    error: undefined,
    log: [],
    authUrl: undefined,
    retry: () => {},
    disconnect: () => {},
    authenticate: () => Promise.resolve(undefined),
    callTool: (_name: string, _args?: Record<string, unknown>) => Promise.resolve(undefined),
    listResources: () => Promise.resolve(),
    readResource: (_uri: string) => Promise.resolve({ contents: [] }),
    listPrompts: () => Promise.resolve(),
    getPrompt: (_name: string, _args?: Record<string, string>) => Promise.resolve({ messages: [] }),
    clearStorage: () => {},
  })
  const [toolForms, setToolForms] = useState<Record<string, Record<string, any>>>({})
  const [toolExecutionLogs, setToolExecutionLogs] = useState<Record<string, string>>({})
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({})
  const [expandedResources, setExpandedResources] = useState<Record<string, boolean>>({})
  const [expandedPrompts, setExpandedPrompts] = useState<Record<string, boolean>>({})
  const [resourceContents, setResourceContents] = useState<Record<string, any>>({})
  const [promptResults, setPromptResults] = useState<Record<string, any>>({})
  const [promptArgs, setPromptArgs] = useState<Record<string, Record<string, string>>>({})
  const logRef = useRef<HTMLDivElement>(null)
  const executionLogRefs = useRef<Record<string, HTMLTextAreaElement | null>>({})

  // Extract connection properties
  const { state, tools, resources, resourceTemplates, prompts, log, authUrl, disconnect, authenticate, readResource, getPrompt } =
    connectionData

  // Notify parent component when tools change
  useEffect(() => {
    if (onToolsUpdate && tools.length > 0) {
      onToolsUpdate(
        tools.map((t: Tool) => ({
          ...t,
          callTool: (args: Record<string, unknown>) => connectionData.callTool(t.name, args),
        }))
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
      resources: [],
      resourceTemplates: [],
      prompts: [],
      error: undefined,
      log: [],
      authUrl: undefined,
      retry: () => {},
      disconnect: () => {},
      authenticate: () => Promise.resolve(undefined),
      callTool: (_name: string, _args?: Record<string, unknown>) => Promise.resolve(undefined),
      listResources: () => Promise.resolve(),
      readResource: (_uri: string) => Promise.resolve({ contents: [] }),
      listPrompts: () => Promise.resolve(),
      getPrompt: (_name: string, _args?: Record<string, string>) => Promise.resolve({ messages: [] }),
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
        return <span className={`${baseClasses} bg-blue-100 text-blue-800`}>Discovering</span>
      case 'authenticating':
        return <span className={`${baseClasses} bg-purple-100 text-purple-800`}>Authenticating</span>
      case 'connecting':
        return <span className={`${baseClasses} bg-yellow-100 text-yellow-800`}>Connecting</span>
      case 'loading':
        return <span className={`${baseClasses} bg-orange-100 text-orange-800`}>Loading</span>
      case 'ready':
        return <span className={`${baseClasses} bg-green-100 text-green-800`}>Connected</span>
      case 'failed':
        return <span className={`${baseClasses} bg-red-100 text-red-800`}>Failed</span>
      case 'not-connected':
      default:
        return <span className={`${baseClasses} bg-gray-100 text-gray-800`}>Not Connected</span>
    }
  }

  // Log the tools to console when they change (for debugging)
  useEffect(() => {
    if (tools.length > 0) {
      console.log('MCP Tools available:', tools)
    }
  }, [tools])

  // Initialize form data when tools change
  useEffect(() => {
    const newForms: Record<string, Record<string, any>> = {}
    tools.forEach((tool: Tool) => {
      if (tool.inputSchema && tool.inputSchema.properties) {
        const formData: Record<string, any> = {}
        Object.entries(tool.inputSchema.properties).forEach(([key, schema]: [string, any]) => {
          // Set default values based on type
          if (schema.type === 'number' || schema.type === 'integer') {
            formData[key] = schema.default || 0
          } else if (schema.type === 'boolean') {
            formData[key] = schema.default || false
          } else {
            formData[key] = schema.default || ''
          }
        })
        newForms[tool.name] = formData
      }
    })
    setToolForms(newForms)
  }, [tools])

  // Handle form input changes
  const handleFormChange = (toolName: string, fieldName: string, value: any) => {
    setToolForms((prev) => ({
      ...prev,
      [toolName]: {
        ...prev[toolName],
        [fieldName]: value,
      },
    }))
  }

  // Helper function to clean and update execution log
  const updateExecutionLog = (toolName: string, newContent: string) => {
    setToolExecutionLogs((prev) => {
      const currentLog = prev[toolName] || ''
      const updatedLog = currentLog + newContent
      // Remove blank lines and rejoin
      const cleanedLog = updatedLog
        .split('\n')
        .filter((line) => line.trim() !== '')
        .join('\n')
      return {
        ...prev,
        [toolName]: cleanedLog + '\n',
      }
    })
  }

  // Handle tool execution
  const handleRunTool = async (tool: Tool) => {
    const args = toolForms[tool.name] || {}
    const argsStr = JSON.stringify(args)

    // Add execution start message
    const startMessage = `Calling ${tool.name}(${argsStr})\n`
    updateExecutionLog(tool.name, startMessage)

    try {
      const result = await connectionData.callTool(tool.name, args)
      const resultStr = typeof result === 'string' ? result : JSON.stringify(result, null, 2)
      updateExecutionLog(tool.name, `${resultStr}\n`)
    } catch (error) {
      updateExecutionLog(tool.name, `Error: ${error}\n`)
    }
  }

  // Auto-scroll execution logs to bottom when they change
  useEffect(() => {
    Object.keys(toolExecutionLogs).forEach((toolName) => {
      const textarea = executionLogRefs.current[toolName]
      if (textarea) {
        textarea.scrollTop = textarea.scrollHeight
      }
    })
  }, [toolExecutionLogs])

  // Clear execution log for specific tool
  const clearExecutionLog = (toolName: string) => {
    setToolExecutionLogs((prev) => ({
      ...prev,
      [toolName]: '',
    }))
  }

  // Toggle tool expanded state
  const toggleTool = (toolName: string) => {
    setExpandedTools((prev) => ({
      ...prev,
      [toolName]: !prev[toolName],
    }))
  }

  // Render form field based on schema
  const renderFormField = (toolName: string, fieldName: string, schema: any, isRequired: boolean) => {
    const value = toolForms[toolName]?.[fieldName] || ''

    if (schema.type === 'number' || schema.type === 'integer') {
      return (
        <input
          type="number"
          className="w-32 p-2 pr-6 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-300 placeholder-gray-300"
          value={value}
          step={schema.type === 'integer' ? 1 : 'any'}
          required={isRequired}
          onChange={(e) => {
            const newValue =
              e.target.value === '' ? '' : schema.type === 'integer' ? parseInt(e.target.value) || 0 : parseFloat(e.target.value) || 0
            handleFormChange(toolName, fieldName, newValue)
          }}
        />
      )
    } else if (schema.type === 'boolean') {
      return (
        <input
          type="checkbox"
          className="h-4 w-4 text-blue-600 rounded focus:ring-blue-300"
          checked={value}
          onChange={(e) => handleFormChange(toolName, fieldName, e.target.checked)}
        />
      )
    } else {
      // String or other text input
      return (
        <input
          type="text"
          className="w-full p-2 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-300 placeholder-gray-300"
          value={value}
          required={isRequired}
          placeholder={schema.description || ''}
          onChange={(e) => handleFormChange(toolName, fieldName, e.target.value)}
        />
      )
    }
  }

  return (
    <section className="rounded-lg bg-white p-4 border border-zinc-200">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">MCP Servers</span>
        {getStatusBadge()}
      </div>

      <p className="text-gray-500 text-xs mt-1 mb-3">
        Connect to Model Context Protocol (MCP) servers to access additional AI capabilities.
      </p>

      <div className="space-y-3">
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
          <select
            className="p-2 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-300"
            value={transportType}
            onChange={(e) => {
              const newValue = e.target.value as 'auto' | 'http' | 'sse'
              setTransportType(newValue)
              sessionStorage.setItem('mcpTransportType', newValue)
            }}
            disabled={isActive && state !== 'failed'}
          >
            <option value="auto">Auto</option>
            <option value="http">HTTP</option>
            <option value="sse">SSE</option>
          </select>

          {state === 'ready' || (isActive && state !== 'not-connected' && state !== 'failed') ? (
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
            <p className="text-xs mb-2">Authentication required. Please click the link below:</p>
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

        {/* Available Tools section - always present */}
        <div>
          <h3 className="font-medium text-sm mb-3">Available Tools ({tools.length})</h3>

          {tools.length === 0 ? (
            <div className="border border-gray-200 rounded p-4 bg-gray-50 text-center text-gray-500 text-sm">
              No tools available. Connect to an MCP server to see available tools.
            </div>
          ) : (
            <div className="border border-gray-200 rounded p-4 bg-gray-50 space-y-2">
              {tools.map((tool: Tool, index: number) => {
                const isExpanded = expandedTools[tool.name] || false

                return (
                  <div key={index} className="bg-white rounded border border-gray-100 shadow-sm">
                    {/* Tool header - always visible */}
                    <div
                      className="flex items-center gap-2 p-3 cursor-pointer hover:bg-gray-50 transition-colors"
                      onClick={() => toggleTool(tool.name)}
                    >
                      {/* Toggle arrow */}
                      {isExpanded ? (
                        <ChevronDown size={16} className="text-gray-500 flex-shrink-0" />
                      ) : (
                        <ChevronRight size={16} className="text-gray-500 flex-shrink-0" />
                      )}

                      {/* Tool name */}
                      <h4 className="font-bold text-base text-black flex-shrink-0">{tool.name}</h4>

                      {/* Tool description when collapsed */}
                      {!isExpanded && tool.description && <p className="text-gray-600 text-sm truncate ml-2">{tool.description}</p>}
                    </div>

                    {/* Expanded content */}
                    {isExpanded && (
                      <div className="px-3 pb-3 border-t border-gray-100">
                        {tool.description && <p className="text-gray-600 mb-4 text-sm leading-relaxed mt-3">{tool.description}</p>}

                        {/* Form for tool parameters */}
                        {tool.inputSchema && tool.inputSchema.properties && (
                          <div className="flex flex-wrap gap-3 mb-4">
                            {Object.entries(tool.inputSchema.properties).map(([fieldName, schema]: [string, any]) => {
                              const isRequired = Array.isArray(tool.inputSchema.required) && tool.inputSchema.required.includes(fieldName)
                              const isTextInput = schema.type !== 'number' && schema.type !== 'integer' && schema.type !== 'boolean'
                              return (
                                <div key={fieldName} className={`space-y-1 ${isTextInput ? 'w-full' : ''}`}>
                                  <div className="flex items-center gap-2">
                                    <label className="text-xs font-medium text-gray-700">{fieldName}</label>
                                    {schema.description && (
                                      <div className="relative group">
                                        <Info size={12} className="text-gray-400 cursor-help" />
                                        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                                          {schema.description}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                  <div>{renderFormField(tool.name, fieldName, schema, isRequired)}</div>
                                </div>
                              )
                            })}
                          </div>
                        )}

                        {/* Run button */}
                        <button
                          onClick={() => handleRunTool(tool)}
                          disabled={state !== 'ready'}
                          className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded py-2 px-4 text-sm font-medium mb-4"
                        >
                          Run
                        </button>

                        {/* Per-tool execution log - only show if there's content */}
                        {toolExecutionLogs[tool.name] && (
                          <div className="border-t border-gray-100 pt-4">
                            <div className="flex items-center justify-between mb-2">
                              <h5 className="font-medium text-sm text-gray-700">Execution Log</h5>
                              <button
                                onClick={() => clearExecutionLog(tool.name)}
                                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
                              >
                                <X size={12} />
                                Clear
                              </button>
                            </div>
                            <textarea
                              ref={(el) => {
                                executionLogRefs.current[tool.name] = el
                              }}
                              value={toolExecutionLogs[tool.name]}
                              readOnly
                              className="w-full h-32 p-2 border border-gray-200 rounded text-[10px] font-mono bg-gray-50 resize-none placeholder-gray-300"
                              placeholder="Tool execution results will appear here..."
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Available Resources section */}
        <div>
          <h3 className="font-medium text-sm mb-3">Available Resources ({resources.length + resourceTemplates.length})</h3>

          {resources.length === 0 && resourceTemplates.length === 0 ? (
            <div className="border border-gray-200 rounded p-4 bg-gray-50 text-center text-gray-500 text-sm">
              No resources available. Connect to an MCP server to see available resources.
            </div>
          ) : (
            <div className="border border-gray-200 rounded p-4 bg-gray-50 space-y-2">
              {/* Direct Resources */}
              {resources.map((resource: Resource, index: number) => {
                const isExpanded = expandedResources[resource.uri] || false
                const contents = resourceContents[resource.uri]

                return (
                  <div key={`resource-${index}`} className="bg-white rounded border border-gray-100 shadow-sm">
                    <div className="p-3">
                      <div className="flex items-start gap-2">
                        <button
                          onClick={() => setExpandedResources((prev) => ({ ...prev, [resource.uri]: !isExpanded }))}
                          className="text-gray-500 hover:text-gray-700 mt-0.5"
                        >
                          {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </button>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <FileText size={14} className="text-gray-400" />
                            <h4 className="font-medium text-sm">{resource.name}</h4>
                          </div>
                          {resource.description && <p className="text-xs text-gray-500 mt-1">{resource.description}</p>}
                          <p className="text-xs text-gray-400 mt-1 font-mono">{resource.uri}</p>
                          {resource.mimeType && <span className="text-xs text-gray-400">({resource.mimeType})</span>}
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="mt-3 space-y-2">
                          <button
                            onClick={async () => {
                              try {
                                const result = await readResource(resource.uri)
                                setResourceContents((prev) => ({ ...prev, [resource.uri]: result }))
                              } catch (error: any) {
                                setResourceContents((prev) => ({ ...prev, [resource.uri]: { error: error.message } }))
                              }
                            }}
                            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium"
                          >
                            Read Resource
                          </button>

                          {contents && (
                            <div className="mt-2">
                              {contents.error ? (
                                <div className="text-xs text-red-600 p-2 border border-red-200 rounded bg-red-50">
                                  Error: {contents.error}
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  {contents.contents?.map((content: any, idx: number) => (
                                    <div key={idx} className="border border-gray-200 rounded p-2">
                                      <div className="text-xs text-gray-500 mb-1">
                                        {content.uri} {content.mimeType && `(${content.mimeType})`}
                                      </div>
                                      <pre className="text-xs font-mono bg-gray-50 p-2 rounded overflow-x-auto">
                                        {content.text || (content.blob && '[Binary content]') || '[No content]'}
                                      </pre>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}

              {/* Resource Templates */}
              {resourceTemplates.map((template: ResourceTemplate, index: number) => (
                <div key={`template-${index}`} className="bg-white rounded border border-gray-100 shadow-sm">
                  <div className="p-3">
                    <div className="flex items-center gap-2">
                      <FileText size={14} className="text-blue-400" />
                      <h4 className="font-medium text-sm">{template.name}</h4>
                      <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded">Template</span>
                    </div>
                    {template.description && <p className="text-xs text-gray-500 mt-1">{template.description}</p>}
                    <p className="text-xs text-gray-400 mt-1 font-mono">{template.uriTemplate}</p>
                    {template.mimeType && <span className="text-xs text-gray-400">({template.mimeType})</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Available Prompts section */}
        <div>
          <h3 className="font-medium text-sm mb-3">Available Prompts ({prompts.length})</h3>

          {prompts.length === 0 ? (
            <div className="border border-gray-200 rounded p-4 bg-gray-50 text-center text-gray-500 text-sm">
              No prompts available. Connect to an MCP server to see available prompts.
            </div>
          ) : (
            <div className="border border-gray-200 rounded p-4 bg-gray-50 space-y-2">
              {prompts.map((prompt: Prompt, index: number) => {
                const isExpanded = expandedPrompts[prompt.name] || false
                const result = promptResults[prompt.name]
                const args = promptArgs[prompt.name] || {}

                return (
                  <div key={index} className="bg-white rounded border border-gray-100 shadow-sm">
                    <div className="p-3">
                      <div className="flex items-start gap-2">
                        <button
                          onClick={() => setExpandedPrompts((prev) => ({ ...prev, [prompt.name]: !isExpanded }))}
                          className="text-gray-500 hover:text-gray-700 mt-0.5"
                        >
                          {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </button>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <MessageSquare size={14} className="text-purple-400" />
                            <h4 className="font-medium text-sm">{prompt.name}</h4>
                          </div>
                          {prompt.description && <p className="text-xs text-gray-500 mt-1">{prompt.description}</p>}
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="mt-3 space-y-2">
                          {/* Prompt Arguments */}
                          {prompt.arguments && prompt.arguments.length > 0 && (
                            <div className="space-y-2">
                              <h5 className="text-xs font-medium text-gray-700">Arguments:</h5>
                              {prompt.arguments.map((arg: any) => (
                                <div key={arg.name} className="space-y-1">
                                  <label className="text-xs text-gray-600">
                                    {arg.name}
                                    {arg.required && <span className="text-red-500 ml-1">*</span>}
                                    {arg.description && <span className="text-gray-400 ml-1">({arg.description})</span>}
                                  </label>
                                  <input
                                    type="text"
                                    className="w-full p-2 border border-gray-200 rounded text-sm"
                                    value={args[arg.name] || ''}
                                    onChange={(e) =>
                                      setPromptArgs((prev) => ({
                                        ...prev,
                                        [prompt.name]: {
                                          ...prev[prompt.name],
                                          [arg.name]: e.target.value,
                                        },
                                      }))
                                    }
                                    placeholder={arg.description || `Enter ${arg.name}`}
                                  />
                                </div>
                              ))}
                            </div>
                          )}

                          <button
                            onClick={async () => {
                              try {
                                const result = await getPrompt(prompt.name, args)
                                setPromptResults((prev) => ({ ...prev, [prompt.name]: result }))
                              } catch (error: any) {
                                setPromptResults((prev) => ({ ...prev, [prompt.name]: { error: error.message } }))
                              }
                            }}
                            className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded text-xs font-medium"
                          >
                            Get Prompt
                          </button>

                          {result && (
                            <div className="mt-2">
                              {result.error ? (
                                <div className="text-xs text-red-600 p-2 border border-red-200 rounded bg-red-50">
                                  Error: {result.error}
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  <h5 className="text-xs font-medium text-gray-700">Messages:</h5>
                                  {result.messages?.map((message: any, idx: number) => (
                                    <div key={idx} className="border border-gray-200 rounded p-2">
                                      <div className="text-xs font-medium text-gray-700 mb-1">{message.role}:</div>
                                      <pre className="text-xs font-mono bg-gray-50 p-2 rounded overflow-x-auto">
                                        {message.content.text || JSON.stringify(message.content, null, 2)}
                                      </pre>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Debug Log */}
        <div>
          <label className="font-medium text-xs block mb-2">Debug Log</label>
          <div ref={logRef} className="border border-gray-200 rounded p-2 bg-gray-50 h-32 overflow-y-auto font-mono text-xs">
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
      {isActive && <McpConnection serverUrl={serverUrl} transportType={transportType} onConnectionUpdate={setConnectionData} />}
    </section>
  )
}
