import { type Conversation } from '../types'

interface UseConversationUpdaterProps {
  conversationId?: number
  setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>
}

export const useConversationUpdater = ({ conversationId, setConversations }: UseConversationUpdaterProps) => {
  
  const updateConversation = (updater: (conversation: Conversation) => Conversation) => {
    setConversations((prev) => {
      const conversation = prev.find((c) => c.id === conversationId)
      if (!conversation) {
        console.error(`Missing conversation for ID ${conversationId}`)
        return prev
      }
      
      const updatedConversation = updater(conversation)
      
      return prev.map((c) => 
        c.id === conversationId ? updatedConversation : c
      )
    })
  }

  return { updateConversation }
}
