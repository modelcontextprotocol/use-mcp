import { useRef, useState } from 'react'
import { CoreMessage, jsonSchema, streamText, tool } from 'ai'
import { createGroq } from '@ai-sdk/groq'
import { createAnthropic } from '@ai-sdk/anthropic'
import { type AssistantMessage, type Conversation, type Message, type SystemMessage, type UserMessage } from '../types'
import { type Model } from '../types/models'
import { getApiKey } from '../utils/apiKeys'
import { type Tool } from 'use-mcp/react'
import { useConversationUpdater } from './useConversationUpdater'

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

  const { updateConversation } = useConversationUpdater({
    conversationId,
    setConversations,
  })

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
  // const supportsReasoning = (model: Model) => {
  //   const reasoningModels = [
  //     'qwen/qwen3-32b',
  //     'qwen-qwq-32b',
  //     'deepseek-r1-distill-llama-70b',
  //     'claude-4-opus-20250514',
  //     'claude-4-sonnet-20250514',
  //     'claude-3-7-sonnet-20250219',
  //   ]
  //   return reasoningModels.includes(model.modelId)
  // }

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

      console.log({ messages })
      const messagesToSend: CoreMessage[] = messages
        .filter((msg) => ['user', 'assistant', 'system'].includes(msg.role) && hasContent(msg))
        .map((msg) => {
          const contentMsg = msg as UserMessage | AssistantMessage | SystemMessage
          return {
            role: contentMsg.role,
            content: contentMsg.content,
          }
        })
      // Prepare stream options
      const streamOptions = {
        model: modelInstance,
        messages: messagesToSend,
        tools: Object.keys(aiTools).length > 0 ? aiTools : undefined,
        maxSteps: 5, // Allow up to 5 steps for tool calling
        abortSignal: controller.signal,
      }

      const result = await streamText(streamOptions)

      // Use fullStream to get all events including tool calls, results, and text
      for await (const event of result.fullStream) {
        const eventTime = Date.now()
        // console.log({ 'result.fullStream.event': event })
        updateConversation((conv) => {
          const lastMessage = conv.messages?.at(-1)
          // console.log({ setConversations: event, conv: JSON.parse(JSON.stringify(conv)) })
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
                const currentReasoningStartTime = eventTime

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
                  reasoningEndTime: eventTime,
                  isReasoningStreaming: false,
                }

                // Try hacking the tool call loop to include reasoning blocks
                messagesToSend.push({
                  role: 'assistant',
                  content: `<think>${lastMessage.content}</think>`,
                })
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
                if (event.toolName && event.toolCallId) {
                  newMessage = {
                    role: 'tool-result',
                    toolName: event.toolName,
                    toolArgs: event.args || {},
                    toolResult: event.result,
                    callId: event.toolCallId,
                  }
                  scrollToBottom(true)
                } else {
                  console.warn('Tool result event missing toolName or toolCallId:', event)
                }
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

          if (updatedMessage || newMessage) {
            const messages = [...conv.messages]

            if (updatedMessage) {
              messages.splice(-1, 1, updatedMessage)
            }

            if (newMessage) {
              messages.push(newMessage)
            }

            // console.log({ updatedMessage, newMessage })
            return { ...conv, messages }
          }

          return conv
        })
      }
    } catch (error: unknown) {
      if (controller.signal.aborted) {
      } else {
        console.error('Error generating response:', error)
      }
    } finally {
      setStreamStarted(false)
      setController(new AbortController())
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
