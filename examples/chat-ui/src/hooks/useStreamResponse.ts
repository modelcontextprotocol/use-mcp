import { useState, useRef } from 'react'
import { streamText, tool, jsonSchema } from 'ai'
import { createGroq } from '@ai-sdk/groq'
import { createAnthropic } from '@ai-sdk/anthropic'
import { type Message, type Conversation, type UserMessage, type AssistantMessage, type SystemMessage } from '../types'
import { type Model } from '../types/models'
import { getApiKey } from '../utils/apiKeys'
import { type Tool } from 'use-mcp/react'

// Debug logging helper
const debugLog = (...args: any[]) => {
  if (typeof window !== 'undefined' && localStorage.getItem('USE_MCP_DEBUG') === 'true') {
    console.log(...args)
  }
}

// Type guard for messages with content
const hasContent = (message: Message): message is UserMessage | AssistantMessage | SystemMessage => {
  return 'content' in message
}

interface UseStreamResponseProps {
  conversationId?: number
  setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>
  scrollToBottom: () => void
  selectedModel: Model
  onApiKeyRequired: (model: Model) => Promise<boolean>
  mcpTools: Tool[]
}

export const useStreamResponse = ({
  conversationId,
  setConversations,
  scrollToBottom,
  selectedModel,
  onApiKeyRequired,
  mcpTools,
}: UseStreamResponseProps) => {
  const [isLoading, setIsLoading] = useState(false)
  const [streamStarted, setStreamStarted] = useState(false)
  const [controller, setController] = useState(new AbortController())
  const aiResponseRef = useRef<string>('')

  // Convert MCP tools to the format expected by the 'ai' package
  const convertMcpToolsToAiTools = (mcpTools: Tool[]) => {
    const aiTools: Record<string, any> = {}
    
    debugLog(`[useStreamResponse] Converting ${mcpTools.length} MCP tools to AI format`)
    
    mcpTools.forEach((mcpTool) => {
      const schema = mcpTool.inputSchema || { type: 'object', properties: {} }
      debugLog(`[useStreamResponse] Converting tool: ${mcpTool.name}`, { description: mcpTool.description, schema })
      
      aiTools[mcpTool.name] = tool({
        description: mcpTool.description,
        parameters: jsonSchema(schema as any),
        execute: async (args: unknown, options?: any) => {
          debugLog(`[useStreamResponse] Tool "${mcpTool.name}" execute called with args:`, args)
          debugLog(`[useStreamResponse] Tool execute options:`, options)
          
          try {
            // Call the MCP tool using the callTool method attached to the tool
            if ('callTool' in mcpTool && typeof mcpTool.callTool === 'function') {
              debugLog(`[useStreamResponse] Calling MCP tool "${mcpTool.name}"...`)
              const result = await mcpTool.callTool(args as Record<string, unknown>)
              debugLog(`[useStreamResponse] Tool "${mcpTool.name}" returned result:`, result)
              return result
            } else {
              throw new Error(`Tool ${mcpTool.name} does not have a callable implementation`)
            }
          } catch (error) {
            console.error(`[useStreamResponse] Error calling MCP tool ${mcpTool.name}:`, error)
            throw error
          }
        },
      })
    })
    
    debugLog(`[useStreamResponse] Converted tools:`, Object.keys(aiTools))
    return aiTools
  }

  const getModelInstance = (model: Model, apiKey: string) => {
    switch (model.provider.id) {
      case 'groq': {
        const groqProvider = createGroq({ apiKey })
        return groqProvider(model.modelId)
      }
      case 'anthropic': {
        const anthropicProvider = createAnthropic({
          apiKey,
          headers: {
            'anthropic-dangerous-direct-browser-access': 'true',
          },
        })
        return anthropicProvider(model.modelId)
      }
      default:
        throw new Error(`Unsupported provider: ${model.provider.id}`)
    }
  }

  const streamResponse = async (messages: Message[]) => {
    let aiResponse = ''
    debugLog(`[useStreamResponse] streamResponse called with ${messages.length} messages`)
    debugLog(`[useStreamResponse] Messages:`, messages)
    debugLog(`[useStreamResponse] Current conversationId:`, conversationId)
    debugLog(`[useStreamResponse] MCP tools available:`, mcpTools.length)

    // Check if API key is available
    let apiKey = getApiKey(selectedModel.provider.id)
    if (!apiKey) {
      const keyProvided = await onApiKeyRequired(selectedModel)
      if (!keyProvided) {
        return // User cancelled
      }
      apiKey = getApiKey(selectedModel.provider.id)
      if (!apiKey) {
        throw new Error('No API key provided')
      }
    }

    try {
      const modelInstance = getModelInstance(selectedModel, apiKey)

      debugLog(`[useStreamResponse] Adding empty assistant message to conversation ${conversationId}`)
      setConversations((prev) => {
        const updated = [...prev]
        const conv = updated.find((c) => c.id === conversationId)
        if (conv) {
          debugLog(`[useStreamResponse] Found conversation, adding assistant message. Current message count: ${conv.messages.length}`)
          conv.messages.push({ role: 'assistant', content: '' })
          debugLog(`[useStreamResponse] After adding assistant message, message count: ${conv.messages.length}`)
        } else {
          debugLog(`[useStreamResponse] Could not find conversation with id: ${conversationId}`)
        }
        return updated
      })
      debugLog(`[useStreamResponse] Setting stream started to true`)
      setStreamStarted(true)

      // Convert MCP tools to AI package format
      const aiTools = convertMcpToolsToAiTools(mcpTools)

      debugLog(`[useStreamResponse] Starting streamText with ${Object.keys(aiTools).length} tools available`)
      debugLog(`[useStreamResponse] Messages:`, messages.map(m => ({ 
        role: m.role, 
        content: hasContent(m) ? m.content.substring(0, 100) + '...' : 'no content' 
      })))

      const result = await streamText({
        model: modelInstance,
        messages: messages.filter(msg => 
          ['user', 'assistant', 'system'].includes(msg.role) && hasContent(msg)
        ).map((msg) => {
          const contentMsg = msg as UserMessage | AssistantMessage | SystemMessage
          return {
            role: contentMsg.role,
            content: contentMsg.content,
          }
        }),
        tools: Object.keys(aiTools).length > 0 ? aiTools : undefined,
        maxSteps: 5, // Allow up to 5 steps for tool calling
        abortSignal: controller.signal,
      })

      debugLog(`[useStreamResponse] streamText result obtained, starting to process fullStream`)

      // Use fullStream to get all events including tool calls, results, and text
      const processedEvents = new Set<string>() // Track processed events to avoid duplicates
      
      for await (const event of result.fullStream) {
        try {
          debugLog(`[useStreamResponse] Full stream event:`, event.type, event)
          
          if (event.type === 'tool-call') {
            const eventKey = `tool-call-${event.toolCallId}`
            if (processedEvents.has(eventKey)) {
              debugLog(`[useStreamResponse] Skipping duplicate tool call:`, eventKey)
              continue
            }
            processedEvents.add(eventKey)
            
            debugLog(`[useStreamResponse] Tool call event:`, event)
            if (event.toolName) {
              setConversations((prev) => {
                const updated = [...prev]
                const conv = updated.find((c) => c.id === conversationId)
                if (conv) {
                  // Check if this tool call already exists
                  const existingToolCall = conv.messages.find(
                    (msg) => msg.role === 'tool-call' && 'callId' in msg && msg.callId === event.toolCallId
                  )
                  if (!existingToolCall) {
                    conv.messages.push({
                      role: 'tool-call',
                      toolName: event.toolName,
                      toolArgs: event.args || {},
                      callId: event.toolCallId || 'unknown',
                    })
                  }
                }
                return updated
              })
              scrollToBottom()
            } else {
              console.warn('[useStreamResponse] Tool call event missing toolName:', event)
            }
          } else if (event.type === 'tool-result') {
            const eventKey = `tool-result-${event.toolCallId}`
            if (processedEvents.has(eventKey)) {
              debugLog(`[useStreamResponse] Skipping duplicate tool result:`, eventKey)
              continue
            }
            processedEvents.add(eventKey)
            
            debugLog(`[useStreamResponse] Tool result event:`, event)
            if (event.toolName) {
              setConversations((prev) => {
                const updated = [...prev]
                const conv = updated.find((c) => c.id === conversationId)
                if (conv) {
                  // Check if this tool result already exists
                  const existingToolResult = conv.messages.find(
                    (msg) => msg.role === 'tool-result' && 'callId' in msg && msg.callId === event.toolCallId
                  )
                  if (!existingToolResult) {
                    conv.messages.push({
                      role: 'tool-result',
                      toolName: event.toolName,
                      toolArgs: event.args || {},
                      toolResult: event.result,
                      callId: event.toolCallId || 'unknown',
                    })
                  }
                }
                return updated
              })
              scrollToBottom()
            } else {
              console.warn('[useStreamResponse] Tool result event missing toolName:', event)
            }
          } else if (event.type === 'text-delta') {
            debugLog(`[useStreamResponse] Text delta:`, event.textDelta)
            
            aiResponse += event.textDelta
            aiResponseRef.current = aiResponse

            //custom extraction of <chat-title> tag
            const titleMatch = aiResponse.match(/<chat-title>(.*?)<\/chat-title>/)
            if (titleMatch) {
              const title = titleMatch[1].trim()
              debugLog(`[useStreamResponse] Extracted title: ${title}`)
              setConversations((prev) => {
                const updated = [...prev]
                const conv = updated.find((c) => c.id === conversationId)
                if (conv) {
                  conv.title = title
                }
                return updated
              })
              aiResponse = aiResponse.replace(/<chat-title>.*?<\/chat-title>/, '').trim()
            }

            setConversations((prev) => {
              const updated = [...prev]
              const conv = updated.find((c) => c.id === conversationId)
              if (conv) {
                debugLog(`[useStreamResponse] Updating conversation message content (length: ${aiResponse.length})`)
                const lastMessage = conv.messages[conv.messages.length - 1]
                if (hasContent(lastMessage)) {
                  lastMessage.content = aiResponse
                }
              } else {
                debugLog(`[useStreamResponse] Could not find conversation with id: ${conversationId}`)
              }
              return updated
            })

            scrollToBottom()
          }
        } catch (e) {
          console.error('[useStreamResponse] Error in full stream processing:', e)
        }
      }
      
      debugLog(`[useStreamResponse] Finished processing full stream. Final response length: ${aiResponse.length}`)
    } catch (error: unknown) {
      if (controller.signal.aborted) {
        debugLog('[useStreamResponse] Stream aborted')
      } else {
        console.error('[useStreamResponse] Error generating response:', error)
        // Log additional error details
        if (error instanceof Error) {
          console.error('[useStreamResponse] Error stack:', error.stack)
          console.error('[useStreamResponse] Error message:', error.message)
        }
        // Remove the assistant message if there was an error
        setConversations((prev) => {
          const updated = [...prev]
          const conv = updated.find((c) => c.id === conversationId)
          if (conv && conv.messages[conv.messages.length - 1].role === 'assistant') {
            debugLog('[useStreamResponse] Removing assistant message due to error')
            conv.messages.pop()
          }
          return updated
        })
      }
    } finally {
      debugLog('[useStreamResponse] Cleaning up stream state')
      setStreamStarted(false)
      setController(new AbortController())
    }
    return aiResponse
  }

  return {
    isLoading,
    setIsLoading,
    streamStarted,
    controller,
    streamResponse,
    aiResponseRef,
  }
}
