import React, { useState, useEffect, FormEvent } from 'react'
import { storeName } from '../consts'
import '../styles/scrollbar.css'
import '../styles/github.css'
import '../styles/markdown.css'
import { type Conversation, type Message } from '../types'
import { type Model } from '../types/models'
import { type IDBPDatabase } from 'idb'
import { type Tool } from 'use-mcp/react'
import ChatMessage from './messages/ChatMessage.tsx'
import ChatInput from './ChatInput'
import ModelSelectionModal from './ModelSelectionModal'
import McpServerModal from './McpServerModal'
import { useAutoscroll } from '../hooks/useAutoscroll'
import { useStreamResponse } from '../hooks/useStreamResponse'
import { useConversationUpdater } from '../hooks/useConversationUpdater'
import { setApiKey } from '../utils/apiKeys'
import { hasApiKey } from '../utils/apiKeys'
import ApiKeyModal from './ApiKeyModal'

interface ConversationThreadProps {
  conversations: Conversation[]
  conversationId?: number
  setConversationId: (id: number) => void
  setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>
  db: IDBPDatabase
  selectedModel: Model
  onApiKeyUpdate: () => void
  onModelChange: (model: Model) => void
  apiKeyUpdateTrigger: number
  mcpTools: Tool[]
  onMcpToolsUpdate: (tools: Tool[]) => void
}

const ConversationThread: React.FC<ConversationThreadProps> = ({
  conversations,
  conversationId,
  setConversationId,
  setConversations,
  db,
  selectedModel,
  onApiKeyUpdate,
  onModelChange,
  apiKeyUpdateTrigger,
  mcpTools,
  onMcpToolsUpdate,
}) => {
  const [input, setInput] = useState<string>('')
  const [apiKeyModal, setApiKeyModal] = useState<{ isOpen: boolean; model: Model | null }>({
    isOpen: false,
    model: null,
  })
  const [modelSelectionModal, setModelSelectionModal] = useState(false)
  const [mcpServerModal, setMcpServerModal] = useState(false)

  const { messagesEndRef, messagesContainerRef, scrollToBottom } = useAutoscroll()

  const handleApiKeyRequired = async (model: Model): Promise<boolean> => {
    return new Promise((resolve) => {
      setApiKeyModal({
        isOpen: true,
        model,
      })

      // Store the resolve function to call when modal is closed
      window.apiKeyModalResolve = resolve
    })
  }

  const handleApiKeySave = (apiKey: string) => {
    if (apiKeyModal.model) {
      setApiKey(apiKeyModal.model.provider.id, apiKey)
      setApiKeyModal({ isOpen: false, model: null })
      // Notify parent that API key was updated
      onApiKeyUpdate()
      // Resolve the promise to continue with the request
      if (window.apiKeyModalResolve) {
        window.apiKeyModalResolve(true)
        delete window.apiKeyModalResolve
      }
    }
  }

  const handleApiKeyCancel = () => {
    setApiKeyModal({ isOpen: false, model: null })
    // Resolve the promise with false to cancel the request
    if (window.apiKeyModalResolve) {
      window.apiKeyModalResolve(false)
      delete window.apiKeyModalResolve
    }
  }

  const { updateConversation } = useConversationUpdater({
    conversationId,
    setConversations,
  })

  const { isLoading, setIsLoading, streamStarted, controller, streamResponse, aiResponseRef } = useStreamResponse({
    conversationId,
    setConversations,
    scrollToBottom,
    selectedModel,
    onApiKeyRequired: handleApiKeyRequired,
    mcpTools,
  })

  const currentConversation = conversations.find((conv) => conv.id === conversationId) || { messages: [], title: '' }

  //when new message chunks are streamed in, scroll to bottom
  useEffect(() => {
    scrollToBottom(isLoading && streamStarted)
  }, [aiResponseRef.current])

  //when conversation changes, scroll to bottom
  useEffect(scrollToBottom, [conversationId])

  //when conversation changes, reset input
  useEffect(() => {
    setInput('')
  }, [conversationId])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return

    if (currentConversation.messages.length === 0) {
      setConversations((prev) => {
        const updated = [...prev]
        updated.unshift({
          id: conversationId,
          title: 'New conversation',
          messages: [],
        })
        return updated
      })
    }

    const userMessage: Message = { role: 'user', content: input }

    setInput('')
    setIsLoading(true)

    updateConversation((conv) => ({
      ...conv,
      messages: [...conv.messages, userMessage],
    }))

    await streamResponse([...currentConversation.messages, userMessage])

    setIsLoading(false)
  }

  const storeMessages = async () => {
    if (!currentConversation.messages || currentConversation.messages.length === 0) {
      return
    }

    const store = db.transaction(storeName, 'readwrite').objectStore(storeName)
    const objectData = {
      id: conversationId,
      title: currentConversation.title,
      messages: currentConversation.messages,
    }
    const value = await store.put(objectData)
    setConversationId(Number(value))
  }

  useEffect(() => {
    if (db && conversationId) {
      storeMessages()
    }
  }, [conversations])

  // console.log({ currentConversation })

  return (
    <div className={`flex flex-col min-h-screen py-12 w-full ${currentConversation.messages.length === 0 ? 'justify-center' : ''}`}>
      <div
        ref={messagesContainerRef}
        className={`
        overflow-x-hidden
        ${currentConversation.messages.length === 0 ? 'flex items-center justify-center pb-6' : 'flex-1 overflow-y-scroll'}`}
      >
        <div className="max-w-2xl mx-auto w-full px-4">
          {currentConversation.messages.length === 0 ? (
            <div className="text-center">{/*<h1 className="text-9xl font-semibold text-zinc-800 h-20 overflow-auto">use-mcp</h1>*/}</div>
          ) : (
            <div className="py-4 px-4 space-y-4">
              {currentConversation.messages.map((message, index) => (
                <ChatMessage key={index} message={message} />
              ))}
              {isLoading && !streamStarted && <div className="text-center text-sm text-zinc-600">Thinking...</div>}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </div>

      <div className={`p-4 ${currentConversation.messages.length === 0 ? 'pb-20' : ''}`}>
        <div className="max-w-2xl mx-auto">
          <ChatInput
            input={input}
            setInput={setInput}
            handleSubmit={handleSubmit}
            isLoading={isLoading}
            streamStarted={streamStarted}
            controller={controller}
            messagesCount={currentConversation.messages.length}
          />

          {/* Model selector and MCP server indicators */}
          <div className="flex items-center justify-between mt-2">
            <button
              onClick={() => setModelSelectionModal(true)}
              className="flex items-center gap-2 text-zinc-600 hover:text-zinc-900 transition-colors cursor-pointer"
            >
              <span className="text-lg">🧠</span>
              <span className="text-sm text-zinc-500">
                {hasApiKey(selectedModel.provider.id) ? selectedModel.name + ' (' + selectedModel.provider.name + ')' : 'none'}
              </span>
            </button>

            <button
              onClick={() => setMcpServerModal(true)}
              className="flex items-center gap-2 text-zinc-600 hover:text-zinc-900 transition-colors cursor-pointer"
            >
              <span className="text-sm text-zinc-500">
                {(() => {
                  try {
                    const servers = JSON.parse(localStorage.getItem('mcpServers') || '[]')
                    const toolCounts = JSON.parse(localStorage.getItem('mcpServerToolCounts') || '{}')

                    const enabledServers = servers.filter((s: any) => s.enabled).length
                    const totalServers = servers.length
                    const enabledTools = mcpTools.length

                    // Calculate total tools across all servers (including disabled ones that were previously connected)
                    const totalTools = servers.reduce((sum: number, server: any) => {
                      return sum + (toolCounts[server.id] || 0)
                    }, 0)

                    if (totalServers === 0) {
                      return '0/0 servers, 0/0 tools'
                    }

                    return `${enabledServers}/${totalServers} servers, ${enabledTools}/${totalTools} tools`
                  } catch {
                    return mcpTools.length > 0 ? `1/1 servers, ${mcpTools.length}/${mcpTools.length} tools` : '0/0 servers, 0/0 tools'
                  }
                })()}
              </span>
              <span className="text-lg">🔌</span>
            </button>
          </div>
        </div>
      </div>

      <ApiKeyModal
        isOpen={apiKeyModal.isOpen}
        onClose={handleApiKeyCancel}
        provider={apiKeyModal.model?.provider ?? { id: '', name: '', baseUrl: '', apiKeyHeader: '', documentationUrl: '' }}
        onSave={handleApiKeySave}
      />

      <ModelSelectionModal
        isOpen={modelSelectionModal}
        onClose={() => setModelSelectionModal(false)}
        selectedModel={selectedModel}
        onModelChange={onModelChange}
        apiKeyUpdateTrigger={apiKeyUpdateTrigger}
      />

      <McpServerModal isOpen={mcpServerModal} onClose={() => setMcpServerModal(false)} onToolsUpdate={onMcpToolsUpdate} />
    </div>
  )
}

export default ConversationThread
