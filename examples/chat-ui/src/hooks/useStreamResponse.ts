import { useState, useRef } from 'react'
import { streamText, tool, jsonSchema } from 'ai'
import { createGroq } from '@ai-sdk/groq'
import { createAnthropic } from '@ai-sdk/anthropic'
import { type Message, type Conversation, type UserMessage, type AssistantMessage, type SystemMessage } from '../types'
import { type Model } from '../types/models'
import { getApiKey } from '../utils/apiKeys'
import { type Tool } from 'use-mcp/react'

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

        // For reasoning-capable models, we'll handle reasoning events manually
        // since the middleware expects <think> tags but the API sends reasoning fields directly

        return baseModel
    }

    const streamResponse = async (messages: Message[]) => {
        let aiResponse = ''
        let currentReasoning = ''
        let currentReasoningStartTime: number | undefined = undefined
        let currentReasoningEndTime: number | undefined = undefined
        let assistantMessageIndex = -1 // Track the index of our assistant message
        let assistantMessageCreated = false // Track if we've created the assistant message yet

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

            // Use fullStream to get all events including tool calls, results, and text
            for await (const event of result.fullStream) {
                try {

                    if (event.type === 'reasoning') {
                        // Track reasoning start time and create assistant message if needed
                        if (!currentReasoningStartTime) {
                            currentReasoningStartTime = Date.now()
                            currentReasoning = '' // Reset reasoning content for new session
                            
                            // Create a new assistant message for reasoning (even if we already have one)
                            // This handles multiple reasoning sessions in the same conversation turn
                            setConversations((prev) => {
                                const updated = [...prev]
                                const conv = updated.find((c) => c.id === conversationId)
                                if (conv) {
                                    conv.messages.push({ 
                                        role: 'assistant', 
                                        content: '',
                                        reasoning: '',
                                        isReasoningStreaming: true,
                                        reasoningStartTime: currentReasoningStartTime
                                    })
                                    assistantMessageIndex = conv.messages.length - 1
                                }
                                return updated
                            })
                            assistantMessageCreated = true
                        }
                        
                        currentReasoning += (event as any).textDelta || ''
                        
                        // Update the assistant message with streaming reasoning in real-time
                        if (assistantMessageCreated) {
                            setConversations((prev) => {
                                const updated = [...prev]
                                const conv = updated.find((c) => c.id === conversationId)
                                if (conv && assistantMessageIndex >= 0) {
                                    const assistantMessage = conv.messages[assistantMessageIndex]
                                    if (assistantMessage && hasContent(assistantMessage) && assistantMessage.role === 'assistant') {
                                        assistantMessage.reasoning = currentReasoning.trim()
                                        assistantMessage.isReasoningStreaming = true
                                        assistantMessage.reasoningStartTime = currentReasoningStartTime
                                    }
                                }
                                return updated
                            })
                        }
                    } else if (event.type === 'tool-call') {
                        
                        // End reasoning phase immediately when we see a tool call for linear flow
                        if (currentReasoningStartTime && !currentReasoningEndTime) {
                            currentReasoningEndTime = Date.now()
                            
                            // Update reasoning end time and stop streaming immediately
                            setConversations((prev) => {
                                const updated = [...prev]
                                const conv = updated.find((c) => c.id === conversationId)
                                if (conv && assistantMessageIndex >= 0) {
                                    const assistantMessage = conv.messages[assistantMessageIndex]
                                    if (assistantMessage && hasContent(assistantMessage) && assistantMessage.role === 'assistant') {
                                        assistantMessage.reasoningEndTime = currentReasoningEndTime
                                        assistantMessage.isReasoningStreaming = false
                                    }
                                }
                                return updated
                            })
                            
                            // Reset reasoning state for potential new reasoning session
                            currentReasoningStartTime = undefined
                            currentReasoningEndTime = undefined
                            assistantMessageCreated = false
                        }
                        
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
                            console.warn('Tool call event missing toolName:', event)
                        }
                    } else if ((event as any).type === 'tool-result') {
                        
                        if ((event as any).toolName && (event as any).toolCallId) {
                            setConversations((prev) => {
                                const updated = [...prev]
                                const conv = updated.find((c) => c.id === conversationId)
                                if (conv) {
                                    // Check if this tool result already exists
                                    const existingToolResult = conv.messages.find(
                                        (msg) => msg.role === 'tool-result' && 'callId' in msg && msg.callId === (event as any).toolCallId
                                    )
                                    if (!existingToolResult) {
                                        // Add tool result message
                                        conv.messages.push({
                                            role: 'tool-result',
                                            toolName: (event as any).toolName,
                                            toolArgs: (event as any).args || {},
                                            toolResult: (event as any).result,
                                            callId: (event as any).toolCallId,
                                        })
                                    } else {
                                    }
                                }
                                return updated
                            })
                            scrollToBottom(true)
                        } else {
                            console.warn('Tool result event missing toolName or toolCallId:', event)
                        }
                    } else if (event.type === 'text-delta') {

                        // Check if we have an existing reasoning message that needs to be finalized
                        let needsNewAssistantMessage = false
                        if (currentReasoningStartTime && !currentReasoningEndTime) {
                            currentReasoningEndTime = Date.now()
                            
                            // Update reasoning end time and stop streaming
                            setConversations((prev) => {
                                const updated = [...prev]
                                const conv = updated.find((c) => c.id === conversationId)
                                if (conv && assistantMessageIndex >= 0) {
                                    const assistantMessage = conv.messages[assistantMessageIndex]
                                    if (assistantMessage && hasContent(assistantMessage) && assistantMessage.role === 'assistant') {
                                        assistantMessage.isReasoningStreaming = false
                                        assistantMessage.reasoningEndTime = currentReasoningEndTime
                                    }
                                }
                                return updated
                            })
                            
                            // Reset reasoning state after reasoning ends
                            currentReasoningStartTime = undefined
                            currentReasoningEndTime = undefined
                            // Force creation of new assistant message for content
                            needsNewAssistantMessage = true
                            assistantMessageCreated = false
                        }

                        // Create assistant message on first text delta if not already created OR if we just finished reasoning
                        if (!assistantMessageCreated || needsNewAssistantMessage) {
                            setConversations((prev) => {
                                const updated = [...prev]
                                const conv = updated.find((c) => c.id === conversationId)
                                if (conv) {
                                    conv.messages.push({ role: 'assistant', content: '' })
                                    assistantMessageIndex = conv.messages.length - 1
                                }
                                return updated
                            })
                            assistantMessageCreated = true
                        }

                        aiResponse += event.textDelta
                        aiResponseRef.current = aiResponse

                        //custom extraction of <chat-title> tag
                        const titleMatch = aiResponse.match(/<chat-title>(.*?)<\/chat-title>/)
                        if (titleMatch) {
                            const title = titleMatch[1].trim()
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
                        }

                        setConversations((prev) => {
                            const updated = [...prev]
                            const conv = updated.find((c) => c.id === conversationId)
                            if (conv) {
                                // Update the specific assistant message we created, not just the last message
                                const assistantMessage = conv.messages[assistantMessageIndex]
                                if (assistantMessage && hasContent(assistantMessage) && assistantMessage.role === 'assistant') {
                                    assistantMessage.content = cleanedResponse
                                } else {
                                }
                            } else {
                            }
                            return updated
                        })

                        scrollToBottom(true)
                    }
                } catch (e) {
                    console.error('Error in full stream processing:', e)
                }
            }

            
            // Final cleanup - ensure reasoning streaming is stopped
            if (assistantMessageCreated && currentReasoningStartTime) {
                if (!currentReasoningEndTime) {
                    currentReasoningEndTime = Date.now()
                }
                
                setConversations((prev) => {
                    const updated = [...prev]
                    const conv = updated.find((c) => c.id === conversationId)
                    if (conv && assistantMessageIndex >= 0) {
                        const assistantMessage = conv.messages[assistantMessageIndex]
                        if (assistantMessage && hasContent(assistantMessage) && assistantMessage.role === 'assistant') {
                            assistantMessage.isReasoningStreaming = false
                            assistantMessage.reasoningEndTime = currentReasoningEndTime
                        }
                    }
                    return updated
                })
            }
        } catch (error: unknown) {
            if (controller.signal.aborted) {
            } else {
                console.error('Error generating response:', error)
                // Remove the assistant message if there was an error and we created one
                if (assistantMessageCreated) {
                    setConversations((prev) => {
                        const updated = [...prev]
                        const conv = updated.find((c) => c.id === conversationId)
                        if (conv && assistantMessageIndex >= 0 && conv.messages[assistantMessageIndex]?.role === 'assistant') {
                            conv.messages.splice(assistantMessageIndex, 1)
                        }
                        return updated
                    })
                }
            }
        } finally {
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
