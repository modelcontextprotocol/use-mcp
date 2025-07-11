import React, { useState, useEffect } from 'react'
import ConversationThread from './ConversationThread.tsx'
import ChatSidebar from './ChatSidebar'
import ChatNavbar from './ChatNavbar'
import { storeName } from '../consts.ts'
import { type Conversation } from '../types'
import { useIndexedDB } from '../hooks/useIndexedDB'
import { type Model } from '../types/models'
import { getSelectedModel, setSelectedModel as saveSelectedModel } from '../utils/modelPreferences'
import { useModels } from '../hooks/useModels'
import { type IDBPDatabase } from 'idb'
import { type Tool } from 'use-mcp/react'

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface ChatAppProps {}

const ChatApp: React.FC<ChatAppProps> = () => {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [conversationId, setConversationId] = useState<number | undefined>(undefined)
  const [sidebarVisible, setSidebarVisible] = useState(false)

  const [selectedModel, setSelectedModel] = useState<Model>(getSelectedModel())
  const [apiKeyUpdateTrigger, setApiKeyUpdateTrigger] = useState<number>(0)
  const [mcpTools, setMcpTools] = useState<Tool[]>([])
  const [animationDelay] = useState<number>(() => -Math.random() * 60)
  const db = useIndexedDB()
  const { models, addToFavorites, toggleFavorite, isFavorite, getFavoriteModels } = useModels()

  const handleApiKeyUpdate = () => {
    setApiKeyUpdateTrigger((prev) => prev + 1)
  }

  // Handle OAuth success messages from popups
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      console.log('DEBUG: Received message in parent window:', event.data)
      if (event.data.type === 'oauth_success') {
        console.log('DEBUG: OAuth success message received, triggering API key update')
        handleApiKeyUpdate()
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  // Poll for OAuth token changes (fallback for when popup messaging doesn't work)
  useEffect(() => {
    const oauthProviders = ['groq', 'openrouter'] as const
    let initialTokens: Record<string, string | null> = {}

    // Capture initial token state
    const captureInitialTokens = () => {
      for (const providerId of oauthProviders) {
        const tokenKey = `aiChatTemplate_token_${providerId}`
        initialTokens[providerId] = localStorage.getItem(tokenKey)
      }
    }

    const checkForNewTokens = () => {
      for (const providerId of oauthProviders) {
        const tokenKey = `aiChatTemplate_token_${providerId}`
        const currentToken = localStorage.getItem(tokenKey)

        // Check if token was added or changed
        if (currentToken !== initialTokens[providerId]) {
          try {
            const parsedToken = JSON.parse(currentToken || '{}')
            if (parsedToken.access_token) {
              console.log('DEBUG: New OAuth token detected for', providerId, 'via polling')
              handleApiKeyUpdate()
              return true // Stop polling once we find a new token
            }
          } catch (e) {
            // Invalid token format, continue checking
          }
        }
      }
      return false
    }

    let pollInterval: NodeJS.Timeout | null = null

    const startPolling = () => {
      // Capture initial state
      captureInitialTokens()

      // Check immediately for existing valid tokens (in case we just redirected from OAuth)
      console.log('DEBUG: Checking for existing OAuth tokens on startup')
      for (const providerId of oauthProviders) {
        const tokenKey = `aiChatTemplate_token_${providerId}`
        const currentToken = localStorage.getItem(tokenKey)

        console.log(`DEBUG: Checking ${providerId} token:`, currentToken ? 'exists' : 'not found')

        if (currentToken) {
          try {
            const parsedToken = JSON.parse(currentToken)
            console.log(`DEBUG: Parsed ${providerId} token:`, parsedToken)
            if (parsedToken.access_token) {
              console.log('DEBUG: Found existing OAuth token for', providerId, 'on startup')
              handleApiKeyUpdate()
              return // Don't start polling if we found a valid token
            }
          } catch (e) {
            console.log(`DEBUG: Failed to parse ${providerId} token:`, e)
          }
        }
      }

      // Start polling every 500ms for new tokens
      pollInterval = setInterval(() => {
        if (checkForNewTokens()) {
          if (pollInterval) {
            clearInterval(pollInterval)
            pollInterval = null
            console.log('DEBUG: Stopped polling for OAuth tokens')
          }
        }
      }, 500)

      console.log('DEBUG: Started polling for OAuth token changes')
    }

    // Start polling after a short delay to allow for popup messages first
    const delayedStart = setTimeout(startPolling, 100)

    return () => {
      if (delayedStart) clearTimeout(delayedStart)
      if (pollInterval) {
        clearInterval(pollInterval)
        console.log('DEBUG: Cleaned up OAuth token polling')
      }
    }
  }, [])

  const handleModelChange = (model: Model) => {
    setSelectedModel(model)
    saveSelectedModel(model)
  }

  // set up conversations on app load
  useEffect(() => {
    getConversations()
    deleteUnusedConversations()
    startNewConversation()
  }, [db])

  // Initialize sidebar visibility based on screen size
  useEffect(() => {
    // const isMobile = window.matchMedia("(max-width: 768px)").matches;
    // setSidebarVisible(!isMobile);
  }, [])

  const getConversations = async () => {
    if (!db) return

    const conversations = (await db.getAll(storeName)) as Conversation[]
    const inverseConversations = conversations.reverse()
    setConversations(inverseConversations)
  }

  const deleteConversation = async (id: number, showPromptToUser = true) => {
    try {
      if (showPromptToUser && !window.confirm('Are you sure you want to delete this conversation?')) {
        return
      }

      await db?.delete(storeName, id)
      setConversations((prev) => prev.filter((conv) => conv.id !== id))
      setConversationId(conversations[0]?.id)
    } catch (error) {
      console.error('Failed to delete conversation:', error)
    }
  }

  const editConversationTitle = async (id: number, newTitle: string) => {
    const conversation = (await db!.get(storeName, id)) as Conversation
    conversation.title = newTitle
    await db!.put(storeName, conversation)
    setConversations((prev) => prev.map((conv) => (conv.id === id ? { ...conv, title: newTitle } : conv)))
  }

  const startNewConversation = async () => {
    //create unique id for new conversation
    setConversationId(Date.now() + Math.floor(Math.random() * 1000))
    // if (window.matchMedia("(max-width: 768px)").matches) {
    //   setSidebarVisible(false);
    // }
  }

  // delete conversations with no messages
  const deleteUnusedConversations = async () => {
    if (!db) return
    const conversations = (await db.getAll(storeName)) as Conversation[]
    const unusedConversations = conversations.filter((conversation) => conversation.messages.length === 0)

    for (const conversation of unusedConversations) {
      deleteConversation(conversation.id as number, false)
    }
  }

  return (
    <div
      className="flex min-h-screen w-screen animated-bg-container"
      style={{ '--random-delay': `${animationDelay}s` } as React.CSSProperties}
    >
      <div className="flex flex-row flex-grow flex-1 min-h-screen relative">
        {/* Sidebar and Navbar components */}
        {false && (
          <>
            <ChatSidebar
              sidebarVisible={sidebarVisible}
              setSidebarVisible={setSidebarVisible}
              conversations={conversations}
              conversationId={conversationId}
              setConversationId={setConversationId}
              deleteConversation={deleteConversation}
              editConversationTitle={editConversationTitle}
              startNewConversation={startNewConversation}
              selectedModel={selectedModel}
              onModelChange={handleModelChange}
              apiKeyUpdateTrigger={apiKeyUpdateTrigger}
              onMcpToolsUpdate={setMcpTools}
              mcpTools={mcpTools}
            />
            <ChatNavbar sidebarVisible={sidebarVisible} setSidebarVisible={setSidebarVisible} />
          </>
        )}
        <div className="flex flex-col flex-grow h-full w-full">
          <ConversationThread
            conversations={conversations}
            conversationId={conversationId}
            setConversationId={setConversationId}
            setConversations={setConversations}
            db={db as IDBPDatabase}
            selectedModel={selectedModel}
            onApiKeyUpdate={handleApiKeyUpdate}
            onModelChange={handleModelChange}
            apiKeyUpdateTrigger={apiKeyUpdateTrigger}
            mcpTools={mcpTools}
            onMcpToolsUpdate={setMcpTools}
            addToFavorites={addToFavorites}
            models={models}
            toggleFavorite={toggleFavorite}
            isFavorite={isFavorite}
            getFavoriteModels={getFavoriteModels}
          />
        </div>
      </div>
    </div>
  )
}

export default ChatApp
