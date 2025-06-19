import { useState, useRef } from 'react'
import { streamText, tool, jsonSchema } from 'ai'
import { createGroq } from '@ai-sdk/groq'
import { createAnthropic } from '@ai-sdk/anthropic'
import { type Message, type Conversation } from '../types'
import { type Model } from '../types/models'
import { getApiKey } from '../utils/apiKeys'
import { type Tool } from 'use-mcp/react'

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
    
    console.log(`[useStreamResponse] Converting ${mcpTools.length} MCP tools to AI format`)
    
    mcpTools.forEach((mcpTool) => {
      const schema = mcpTool.inputSchema || { type: 'object', properties: {} }
      console.log(`[useStreamResponse] Converting tool: ${mcpTool.name}`, { description: mcpTool.description, schema })
      
      aiTools[mcpTool.name] = tool({
        description: mcpTool.description,
        parameters: jsonSchema(schema as any),
        execute: async (args: unknown, options?: any) => {
          console.log(`[useStreamResponse] Tool "${mcpTool.name}" execute called with args:`, args)
          console.log(`[useStreamResponse] Tool execute options:`, options)
          
          try {
            // Call the MCP tool using the callTool method attached to the tool
            if ('callTool' in mcpTool && typeof mcpTool.callTool === 'function') {
              console.log(`[useStreamResponse] Calling MCP tool "${mcpTool.name}"...`)
              const result = await mcpTool.callTool(args as Record<string, unknown>)
              console.log(`[useStreamResponse] Tool "${mcpTool.name}" returned result:`, result)
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
    
    console.log(`[useStreamResponse] Converted tools:`, Object.keys(aiTools))
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
    console.log(`[useStreamResponse] streamResponse called with ${messages.length} messages`)
    console.log(`[useStreamResponse] Messages:`, messages)
    console.log(`[useStreamResponse] Current conversationId:`, conversationId)
    console.log(`[useStreamResponse] MCP tools available:`, mcpTools.length)

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

      console.log(`[useStreamResponse] Adding empty assistant message to conversation ${conversationId}`)
      setConversations((prev) => {
        const updated = [...prev]
        const conv = updated.find((c) => c.id === conversationId)
        if (conv) {
          console.log(`[useStreamResponse] Found conversation, adding assistant message. Current message count: ${conv.messages.length}`)
          conv.messages.push({ role: 'assistant', content: '' })
          console.log(`[useStreamResponse] After adding assistant message, message count: ${conv.messages.length}`)
        } else {
          console.warn(`[useStreamResponse] Could not find conversation with id: ${conversationId}`)
        }
        return updated
      })
      console.log(`[useStreamResponse] Setting stream started to true`)
      setStreamStarted(true)

      // Convert MCP tools to AI package format
      const aiTools = convertMcpToolsToAiTools(mcpTools)

      console.log(`[useStreamResponse] Starting streamText with ${Object.keys(aiTools).length} tools available`)
      console.log(`[useStreamResponse] Messages:`, messages.map(m => ({ role: m.role, content: m.content.substring(0, 100) + '...' })))

      const result = await streamText({
        model: modelInstance,
        messages: messages.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
        tools: Object.keys(aiTools).length > 0 ? aiTools : undefined,
        maxSteps: 5, // Allow up to 5 steps for tool calling
        onStepFinish({ text, toolCalls, toolResults, finishReason, usage }) {
          console.log(`[useStreamResponse] Step finished:`, {
            text: text ? text.substring(0, 100) + '...' : 'no text',
            toolCallsCount: toolCalls?.length || 0,
            toolResultsCount: toolResults?.length || 0,
            finishReason,
            usage
          })
          if (toolCalls && toolCalls.length > 0) {
            console.log(`[useStreamResponse] Tool calls in step:`, toolCalls)
          }
          if (toolResults && toolResults.length > 0) {
            console.log(`[useStreamResponse] Tool results in step:`, toolResults)
          }
        },
        abortSignal: controller.signal,
      })

      console.log(`[useStreamResponse] streamText result obtained, starting to process stream`)
      console.log(`[useStreamResponse] Result object:`, { 
        hasTextStream: !!result.textStream,
        hasToolCalls: !!result.toolCalls,
        hasToolResults: !!result.toolResults,
        hasFullStream: !!result.fullStream
      })

      // Log tool calls if they exist
      if (result.toolCalls) {
        console.log(`[useStreamResponse] Tool calls detected:`, result.toolCalls)
      }

      // Log tool results if they exist  
      if (result.toolResults) {
        console.log(`[useStreamResponse] Tool results detected:`, result.toolResults)
      }

      let chunkCount = 0
      for await (const chunk of result.textStream) {
        try {
          chunkCount++
          console.log(`[useStreamResponse] Processing chunk ${chunkCount}:`, JSON.stringify(chunk))
          
          aiResponse += chunk
          aiResponseRef.current = aiResponse

          console.log(`[useStreamResponse] Updated aiResponse (length: ${aiResponse.length}):`, aiResponse.substring(0, 200) + '...')

          //custom extraction of <chat-title> tag
          const titleMatch = aiResponse.match(/<chat-title>(.*?)<\/chat-title>/)
          if (titleMatch) {
            const title = titleMatch[1].trim()
            console.log(`[useStreamResponse] Extracted title: ${title}`)
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
              console.log(`[useStreamResponse] Updating conversation message content (length: ${aiResponse.length})`)
              conv.messages[conv.messages.length - 1].content = aiResponse
            } else {
              console.warn(`[useStreamResponse] Could not find conversation with id: ${conversationId}`)
            }
            return updated
          })

          scrollToBottom()
        } catch (e) {
          console.error('[useStreamResponse] Error in text chunk processing:', e)
        }
      }
      
      console.log(`[useStreamResponse] Finished processing ${chunkCount} chunks. Final response length: ${aiResponse.length}`)
    } catch (error: unknown) {
      if (controller.signal.aborted) {
        console.log('[useStreamResponse] Stream aborted')
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
            console.log('[useStreamResponse] Removing assistant message due to error')
            conv.messages.pop()
          }
          return updated
        })
      }
    } finally {
      console.log('[useStreamResponse] Cleaning up stream state')
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
