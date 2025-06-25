import { useState, useRef } from 'react'
import { streamText, tool, jsonSchema } from 'ai'
import { createGroq } from '@ai-sdk/groq'
import { createAnthropic } from '@ai-sdk/anthropic'
import { type Message, type Conversation, type UserMessage, type AssistantMessage, type SystemMessage } from '../types'
import { type Model } from '../types/models'
import { getApiKey } from '../utils/apiKeys'
import { type Tool } from 'use-mcp/react'

// Debug logging for message operations
const debugMessages = (...args: any[]) => {
  if (typeof window !== 'undefined' && localStorage.getItem('USE_MCP_DEBUG') === 'true') {
    console.log('[Messages]', ...args)
  }
}

// Type guard for messages with content
const hasContent = (message: Message): message is UserMessage | AssistantMessage | SystemMessage => {
  return 'content' in message
}

interface UseStreamResponseProps {
  conversationId?: number
  setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>
  scrollToBottom: (force?: boolean) => void
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

    mcpTools.forEach((mcpTool) => {
      const schema = mcpTool.inputSchema || { type: 'object', properties: {} }

      aiTools[mcpTool.name] = tool({
        description: mcpTool.description,
        parameters: jsonSchema(schema as any),
        execute: async (args: unknown) => {
          try {
            // Call the MCP tool using the callTool method attached to the tool
            if ('callTool' in mcpTool && typeof mcpTool.callTool === 'function') {
              const result = await mcpTool.callTool(args as Record<string, unknown>)
              return result
            } else {
              throw new Error(`Tool ${mcpTool.name} does not have a callable implementation`)
            }
          } catch (error) {
            console.error(`Error calling MCP tool ${mcpTool.name}:`, error)
            throw error
          }
        },
      })
    })
    return aiTools
  }

  // Check if a model supports reasoning
  const supportsReasoning = (model: Model) => {
    const reasoningModels = [
      'qwen/qwen3-32b',
      'qwen-qwq-32b',
      'deepseek-r1-distill-llama-70b',
      'claude-4-opus-20250514',
      'claude-4-sonnet-20250514',
      'claude-3-7-sonnet-20250219',
    ]
    return reasoningModels.includes(model.modelId)
  }

  const getModelInstance = (model: Model, apiKey: string) => {
    let baseModel

    switch (model.provider.id) {
      case 'groq': {
        const groqProvider = createGroq({ apiKey })
        baseModel = groqProvider(model.modelId)
        break
      }
      case 'anthropic': {
        const anthropicProvider = createAnthropic({
          apiKey,
          headers: {
            'anthropic-dangerous-direct-browser-access': 'true',
          },
        })
        baseModel = anthropicProvider(model.modelId)
        break
      }
      default:
        throw new Error(`Unsupported provider: ${model.provider.id}`)
    }

    // For reasoning-capable models, we'll handle reasoning events manually
    // since the middleware expects <think> tags but the API sends reasoning fields directly

    return baseModel
  }

  const streamResponse = async (messages: Message[]) => {
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

      setStreamStarted(true)

      // Convert MCP tools to AI package format
      const aiTools = convertMcpToolsToAiTools(mcpTools)

      // Prepare stream options
      const streamOptions = {
        model: modelInstance,
        messages: messages
          .filter((msg) => ['user', 'assistant', 'system'].includes(msg.role) && hasContent(msg))
          .map((msg) => {
            const contentMsg = msg as UserMessage | AssistantMessage | SystemMessage
            return {
              role: contentMsg.role,
              content: contentMsg.content,
            }
          }),
        tools: Object.keys(aiTools).length > 0 ? aiTools : undefined,
        maxSteps: 5, // Allow up to 5 steps for tool calling
        abortSignal: controller.signal,
      }

      const result = await streamText(streamOptions)

      // Use fullStream to get all events including tool calls, results, and text
      for await (const event of result.fullStream) {
        console.log({ 'result.fullStream.event': event })
        setConversations((prev) => {
          const conv = prev.find((c) => c.id === conversationId)
          if (!conv) {
            console.error(`Missing conversation for ID ${conversationId}! Ignoring ${JSON.stringify(event)}`)
            return prev
          }
          const lastMessage = conv.messages?.at(-1)
          console.log({ setConversations: event, conv: JSON.parse(JSON.stringify(conv)) })
          let updatedMessage: Message | undefined
          let newMessage: Message | undefined
          try {
            if (event.type === 'reasoning') {
              if (lastMessage?.role === 'assistant' && lastMessage.type === 'reasoning') {
                // We have an existing reasoning block!
                updatedMessage = {
                  ...lastMessage,
                  content: lastMessage.content + event.textDelta,
                }
              } else {
                // We need a new reasoning block!
                const currentReasoningStartTime = Date.now()

                // Create a new assistant message for reasoning (even if we already have one)
                // This handles multiple reasoning sessions in the same conversation turn
                newMessage = {
                  role: 'assistant',
                  type: 'reasoning',
                  content: event.textDelta,
                  isReasoningStreaming: true,
                  reasoningStartTime: currentReasoningStartTime!,
                }
              }
            } else {
              // We're not thinking, so maybe close the last message?
              if (lastMessage?.role === 'assistant' && lastMessage.type === 'reasoning') {
                updatedMessage = {
                  ...lastMessage,
                  reasoningEndTime: Date.now(),
                  isReasoningStreaming: false,
                }
              }

              if (event.type === 'tool-call') {
                if (event.toolName) {
                  newMessage = {
                    role: 'tool-call',
                    toolName: event.toolName,
                    toolArgs: event.args || {},
                    callId: event.toolCallId || 'unknown',
                  }
                  scrollToBottom(true)
                } else {
                  console.warn('Tool call event missing toolName:', event)
                }
              } else if (event.type === 'tool-result') {
                console.info(`TODO TOOL RESULT`, event)
                // if (event.toolName && event.toolCallId) {
                //   setConversations((prev) => {
                //     const updated = [...prev]
                //     const conv = updated.find((c) => c.id === conversationId)
                //     if (conv) {
                //       conv.messages.push({
                //         role: 'tool-result',
                //         toolName: event.toolName,
                //         toolArgs: event.args || {},
                //         toolResult: event.result,
                //         callId: event.toolCallId,
                //       })
                //       debugMessages('Added new tool-result message:', event.toolName, 'callId:', event.toolCallId)
                //       debugMessages('Current messages:', JSON.stringify(conv.messages))
                //     }
                //     return updated
                //   })
                //   scrollToBottom(true)
                // } else {
                //   console.warn('Tool result event missing toolName or toolCallId:', event)
                // }
              } else if (event.type === 'text-delta') {
                if (lastMessage?.role !== 'assistant' || lastMessage.type !== 'content') {
                  newMessage = {
                    role: 'assistant',
                    content: event.textDelta,
                    type: 'content',
                  }
                } else {
                  updatedMessage = {
                    ...lastMessage,
                    content: lastMessage.content + event.textDelta,
                  }
                }
                scrollToBottom(true)
              }
            }
          } catch (e) {
            console.error('Error in full stream processing:', e)
          }
          let updated = prev
          if (updatedMessage || newMessage) {
            updated = prev.map((c) => {
              if (c.id !== conversationId) return c
              const messages = [...c.messages]

              if (updatedMessage) {
                messages.splice(-1, 1, updatedMessage)
              }

              if (newMessage) {
                messages.push(newMessage)
              }

              return { ...c, messages }
            })
          }
          console.log({ updatedMessage, newMessage })
          return updated
        })
      }

      // Show final conversation state
      setConversations((prev) => {
        const conv = prev.find((c) => c.id === conversationId)
        if (conv) {
          debugMessages('Final conversation state:', JSON.stringify(conv.messages))
        }
        return prev
      })
      //
      // // Final cleanup - ensure reasoning streaming is stopped
      // if (assistantMessageCreated && currentReasoningStartTime) {
      //   if (!currentReasoningEndTime) {
      //     currentReasoningEndTime = Date.now()
      //   }
      //
      //   setConversations((prev) => {
      //     const updated = [...prev]
      //     const conv = updated.find((c) => c.id === conversationId)
      //     if (conv && assistantMessageIndex >= 0) {
      //       const assistantMessage = conv.messages[assistantMessageIndex]
      //       if (assistantMessage && hasContent(assistantMessage) && assistantMessage.role === 'assistant') {
      //         assistantMessage.isReasoningStreaming = false
      //         assistantMessage.reasoningEndTime = currentReasoningEndTime
      //       }
      //     }
      //     return updated
      //   })
      // }
    } catch (error: unknown) {
      if (controller.signal.aborted) {
      } else {
        console.error('Error generating response:', error)
      }
    } finally {
      setStreamStarted(false)
      setController(new AbortController())
      debugMessages('Stream response function completed')
    }
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
