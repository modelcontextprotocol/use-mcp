import { useState, useRef } from 'react'
import { streamText, tool, jsonSchema, wrapLanguageModel, extractReasoningMiddleware } from 'ai'
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

    // Check if a model supports reasoning
    const supportsReasoning = (model: Model) => {
        const reasoningModels = [
            'qwen/qwen3-32b',
            'qwen-qwq-32b',
            'deepseek-r1-distill-llama-70b',
            'claude-4-opus-20250514',
            'claude-4-sonnet-20250514',
            'claude-3-7-sonnet-20250219'
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

        // Wrap reasoning-capable models with extractReasoningMiddleware
        if (supportsReasoning(model)) {
            debugLog(`[useStreamResponse] Wrapping model with extractReasoningMiddleware for ${model.modelId}`)
            return wrapLanguageModel({
                model: baseModel,
                middleware: extractReasoningMiddleware({ 
                    tagName: 'think',
                    startWithReasoning: true // This ensures reasoning tags are prepended if missing
                }),
            })
        }

        return baseModel
    }

    const streamResponse = async (messages: Message[]) => {
        let aiResponse = ''
        let reasoning = ''
        let reasoningStartTime: number | undefined = undefined
        let reasoningEndTime: number | undefined = undefined
        let assistantMessageIndex = -1 // Track the index of our assistant message
        let assistantMessageCreated = false // Track if we've created the assistant message yet
        let hasProcessedToolResults = false // Track if we've processed tool results
        let postToolReasoningContent = '' // Track reasoning content after tool results

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

            debugLog(`[useStreamResponse] Setting stream started to true`)
            setStreamStarted(true)

            // Convert MCP tools to AI package format
            const aiTools = convertMcpToolsToAiTools(mcpTools)

            debugLog(`[useStreamResponse] Starting streamText with ${Object.keys(aiTools).length} tools available`)
            debugLog(`[useStreamResponse] Messages:`, messages.map(m => ({
                role: m.role,
                content: hasContent(m) ? m.content.substring(0, 100) + '...' : 'no content'
            })))

            // Prepare stream options
            const streamOptions: any = {
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
            }

            const result = await streamText(streamOptions)

            debugLog(`[useStreamResponse] streamText result obtained, starting to process fullStream`)

            // Use fullStream to get all events including tool calls, results, and text
            const processedEvents = new Set<string>() // Track processed events to avoid duplicates

            for await (const event of result.fullStream) {
                try {
                    debugLog(`[useStreamResponse] Full stream event:`, event.type, event)

                    if (event.type === 'reasoning') {
                        debugLog(`[useStreamResponse] Reasoning event:`, event)
                        
                        // If we've processed tool results, collect this content for final response
                        if (hasProcessedToolResults) {
                            postToolReasoningContent += event.textDelta
                            debugLog(`[useStreamResponse] Collecting post-tool reasoning:`, postToolReasoningContent.length, 'chars')
                            continue
                        }
                        
                        // Track reasoning start time and create assistant message if needed
                        if (!reasoningStartTime) {
                            reasoningStartTime = Date.now()
                            debugLog(`[useStreamResponse] Reasoning started at:`, reasoningStartTime)
                            
                            // Create assistant message immediately when reasoning starts
                            if (!assistantMessageCreated) {
                                debugLog(`[useStreamResponse] Creating assistant message for reasoning`)
                                setConversations((prev) => {
                                    const updated = [...prev]
                                    const conv = updated.find((c) => c.id === conversationId)
                                    if (conv) {
                                        conv.messages.push({ 
                                            role: 'assistant', 
                                            content: '',
                                            reasoning: '',
                                            isReasoningStreaming: true,
                                            reasoningStartTime: reasoningStartTime
                                        })
                                        assistantMessageIndex = conv.messages.length - 1
                                        debugLog(`[useStreamResponse] Created assistant message at index ${assistantMessageIndex}`)
                                    }
                                    return updated
                                })
                                assistantMessageCreated = true
                            }
                        }
                        
                        reasoning += (event as any).textDelta || ''
                        debugLog(`[useStreamResponse] Reasoning content so far:`, reasoning.length, 'chars')
                        
                        // Update the assistant message with streaming reasoning in real-time
                        if (assistantMessageCreated) {
                            setConversations((prev) => {
                                const updated = [...prev]
                                const conv = updated.find((c) => c.id === conversationId)
                                if (conv && assistantMessageIndex >= 0) {
                                    const assistantMessage = conv.messages[assistantMessageIndex]
                                    if (assistantMessage && hasContent(assistantMessage) && assistantMessage.role === 'assistant') {
                                        // Clean the reasoning content as we stream
                                        let cleanedReasoning = reasoning
                                        cleanedReasoning = cleanedReasoning.replace(/<think>/g, '').replace(/<\/think>/g, '')
                                        cleanedReasoning = cleanedReasoning.trim()
                                        
                                        assistantMessage.reasoning = cleanedReasoning
                                        assistantMessage.isReasoningStreaming = true
                                        assistantMessage.reasoningStartTime = reasoningStartTime
                                    }
                                }
                                return updated
                            })
                        }
                    } else if (event.type === 'tool-call') {
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
                            scrollToBottom(true)
                        } else {
                            console.warn('[useStreamResponse] Tool call event missing toolName:', event)
                        }
                    } else if (event.type === 'tool-result') {
                        debugLog(`[useStreamResponse] Tool result:`, event)
                        
                        if (event.toolName && event.toolCallId) {
                            setConversations((prev) => {
                                const updated = [...prev]
                                const conv = updated.find((c) => c.id === conversationId)
                                if (conv) {
                                    // Check if this tool result already exists to prevent duplicates
                                    const existingResult = conv.messages.find(
                                        (msg) => msg.role === 'tool-result' && 'callId' in msg && msg.callId === event.toolCallId
                                    )
                                    if (!existingResult) {
                                        // Add tool result message
                                        conv.messages.push({
                                            role: 'tool-result',
                                            toolName: event.toolName,
                                            toolArgs: event.args || {},
                                            toolResult: event.result,
                                            callId: event.toolCallId,
                                        })
                                        debugLog(`[useStreamResponse] Added tool result for callId: ${event.toolCallId}`)
                                        hasProcessedToolResults = true
                                    } else {
                                        debugLog(`[useStreamResponse] Skipping duplicate tool result for callId: ${event.toolCallId}`)
                                    }
                                }
                                return updated
                            })
                            scrollToBottom(true)
                        } else {
                            console.warn('[useStreamResponse] Tool result event missing toolName or toolCallId:', event)
                        }
                    } else if (event.type === 'text-delta') {
                        debugLog(`[useStreamResponse] Text delta:`, event.textDelta)

                        // Create assistant message on first text delta if not already created
                        if (!assistantMessageCreated) {
                            debugLog(`[useStreamResponse] Creating assistant message after tool calls/results`)
                            setConversations((prev) => {
                                const updated = [...prev]
                                const conv = updated.find((c) => c.id === conversationId)
                                if (conv) {
                                    conv.messages.push({ role: 'assistant', content: '' })
                                    assistantMessageIndex = conv.messages.length - 1
                                    debugLog(`[useStreamResponse] Created assistant message at index ${assistantMessageIndex}`)
                                }
                                return updated
                            })
                            assistantMessageCreated = true
                        }
                        
                        // Mark reasoning end time when text starts (reasoning is done)
                        if (reasoningStartTime && !reasoningEndTime) {
                            reasoningEndTime = Date.now()
                            debugLog(`[useStreamResponse] Reasoning ended at:`, reasoningEndTime, 'Duration:', reasoningEndTime - reasoningStartTime, 'ms')
                            
                            // Update reasoning end time and stop streaming
                            setConversations((prev) => {
                                const updated = [...prev]
                                const conv = updated.find((c) => c.id === conversationId)
                                if (conv && assistantMessageIndex >= 0) {
                                    const assistantMessage = conv.messages[assistantMessageIndex]
                                    if (assistantMessage && hasContent(assistantMessage) && assistantMessage.role === 'assistant') {
                                        assistantMessage.isReasoningStreaming = false
                                        assistantMessage.reasoningEndTime = reasoningEndTime
                                    }
                                }
                                return updated
                            })
                        }

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

                        // Remove thinking tags from the display text (they should be extracted by middleware)
                        let cleanedResponse = aiResponse
                        if (supportsReasoning(selectedModel)) {
                            debugLog(`[useStreamResponse] Original response:`, aiResponse.substring(0, 100))
                            // Remove complete thinking blocks
                            cleanedResponse = aiResponse.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
                            // Remove unclosed think tags (everything from <think> to end)
                            cleanedResponse = cleanedResponse.replace(/<think>[\s\S]*$/g, '').trim()
                            // Remove any remaining opening think tags
                            cleanedResponse = cleanedResponse.replace(/<think>/g, '').trim()
                            // Remove any remaining closing think tags
                            cleanedResponse = cleanedResponse.replace(/<\/think>/g, '').trim()
                            // Clean up any remaining whitespace or newlines at the start
                            cleanedResponse = cleanedResponse.replace(/^\s+/, '')
                            debugLog(`[useStreamResponse] Cleaned response:`, cleanedResponse.substring(0, 100))
                        }

                        setConversations((prev) => {
                            const updated = [...prev]
                            const conv = updated.find((c) => c.id === conversationId)
                            if (conv) {
                                debugLog(`[useStreamResponse] Updating conversation message content (length: ${cleanedResponse.length})`)
                                // Update the specific assistant message we created, not just the last message
                                const assistantMessage = conv.messages[assistantMessageIndex]
                                if (assistantMessage && hasContent(assistantMessage) && assistantMessage.role === 'assistant') {
                                    assistantMessage.content = cleanedResponse
                                    debugLog(`[useStreamResponse] Updated assistant message at index ${assistantMessageIndex}`)
                                } else {
                                    debugLog(`[useStreamResponse] Could not find assistant message at index ${assistantMessageIndex}`, assistantMessage)
                                }
                            } else {
                                debugLog(`[useStreamResponse] Could not find conversation with id: ${conversationId}`)
                            }
                            return updated
                        })

                        scrollToBottom(true)
                    }
                } catch (e) {
                    console.error('[useStreamResponse] Error in full stream processing:', e)
                }
            }

            debugLog(`[useStreamResponse] Finished processing full stream. Final response length: ${aiResponse.length}`)
            debugLog(`[useStreamResponse] Final aiResponse content:`, JSON.stringify(aiResponse))
            debugLog(`[useStreamResponse] Final reasoning content:`, reasoning.length, 'chars:', reasoning.substring(0, 100))
            
            // Process post-tool reasoning content as final response
            if (hasProcessedToolResults && postToolReasoningContent.trim()) {
                debugLog(`[useStreamResponse] Processing post-tool reasoning as final response:`, postToolReasoningContent.length, 'chars')
                
                // Clean the content to remove any duplicated reasoning
                let finalContent = postToolReasoningContent.trim()
                
                // Create final assistant response message
                setConversations((prev) => {
                    const updated = [...prev]
                    const conv = updated.find((c) => c.id === conversationId)
                    if (conv) {
                        conv.messages.push({ 
                            role: 'assistant', 
                            content: finalContent
                        })
                        debugLog(`[useStreamResponse] Added final assistant response message`)
                    }
                    return updated
                })
                scrollToBottom(true)
            }
            
            // Final cleanup - ensure reasoning streaming is stopped
            if (assistantMessageCreated && reasoningStartTime) {
                if (!reasoningEndTime) {
                    reasoningEndTime = Date.now()
                    debugLog(`[useStreamResponse] Final reasoning end time:`, reasoningEndTime)
                }
                
                setConversations((prev) => {
                    const updated = [...prev]
                    const conv = updated.find((c) => c.id === conversationId)
                    if (conv && assistantMessageIndex >= 0) {
                        const assistantMessage = conv.messages[assistantMessageIndex]
                        if (assistantMessage && hasContent(assistantMessage) && assistantMessage.role === 'assistant') {
                            assistantMessage.isReasoningStreaming = false
                            assistantMessage.reasoningEndTime = reasoningEndTime
                            debugLog(`[useStreamResponse] Final reasoning cleanup completed`)
                        }
                    }
                    return updated
                })
            }
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
                // Remove the assistant message if there was an error and we created one
                if (assistantMessageCreated) {
                    setConversations((prev) => {
                        const updated = [...prev]
                        const conv = updated.find((c) => c.id === conversationId)
                        if (conv && assistantMessageIndex >= 0 && conv.messages[assistantMessageIndex]?.role === 'assistant') {
                            debugLog('[useStreamResponse] Removing assistant message due to error')
                            conv.messages.splice(assistantMessageIndex, 1)
                        }
                        return updated
                    })
                }
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
