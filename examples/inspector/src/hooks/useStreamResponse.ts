import { useState, useRef } from 'react'
import { streamText } from 'ai'
import { createGroq } from '@ai-sdk/groq'
import { createAnthropic } from '@ai-sdk/anthropic'
import { type Message, type Conversation } from '../types'
import { type Model } from '../types/models'
import { getApiKey } from '../utils/apiKeys'

interface UseStreamResponseProps {
  conversationId?: number
  setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>
  scrollToBottom: () => void
  selectedModel: Model
  onApiKeyRequired: (model: Model) => Promise<boolean>
}

export const useStreamResponse = ({
  conversationId,
  setConversations,
  scrollToBottom,
  selectedModel,
  onApiKeyRequired,
}: UseStreamResponseProps) => {
  const [isLoading, setIsLoading] = useState(false)
  const [streamStarted, setStreamStarted] = useState(false)
  const [controller, setController] = useState(new AbortController())
  const aiResponseRef = useRef<string>('')

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
    console.log({ messages })

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

      setConversations((prev) => {
        const updated = [...prev]
        const conv = updated.find((c) => c.id === conversationId)
        if (conv) {
          console.log('POPPING')
          conv.messages.push({ role: 'assistant', content: '' })
        }
        return updated
      })
      setStreamStarted(true)

      const result = await streamText({
        model: modelInstance,
        messages: messages.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
        abortSignal: controller.signal,
      })

      for await (const chunk of result.textStream) {
        try {
          aiResponse += chunk
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

          setConversations((prev) => {
            const updated = [...prev]
            const conv = updated.find((c) => c.id === conversationId)
            if (conv) {
              conv.messages[conv.messages.length - 1].content = aiResponse
            }
            return updated
          })

          scrollToBottom()
        } catch (e) {
          console.log('Error in text chunk', e)
        }
      }
    } catch (error: unknown) {
      if (controller.signal.aborted) {
        console.log('Stream aborted')
      } else {
        console.error('Error generating response:', error)
        // Remove the assistant message if there was an error
        setConversations((prev) => {
          const updated = [...prev]
          const conv = updated.find((c) => c.id === conversationId)
          if (conv && conv.messages[conv.messages.length - 1].role === 'assistant') {
            conv.messages.pop()
          }
          return updated
        })
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
