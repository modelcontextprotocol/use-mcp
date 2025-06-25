import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { type Message } from '../../types'
import ToolCallMessage from './ToolCallMessage.tsx'
import ToolResultMessage from './ToolResultMessage.tsx'
import AssistantMessage from './AssistantMessage.tsx'
import ReasoningMessage from './ReasoningMessage.tsx'

interface ChatMessageProps {
  message: Message
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
  // Handle tool calls and results differently
  if (message.role === 'tool-call') {
    return <ToolCallMessage message={message} />
  }

  if (message.role === 'tool-result') {
    return <ToolResultMessage message={message} />
  }

  if (message.role === 'assistant') {
    if (message.type === 'reasoning') {
      return <ReasoningMessage message={message} />
    } else {
      return <AssistantMessage message={message} />
    }
  }

  // Handle regular messages (user, assistant, system)
  return (
    <div className={`flex justify-end`}>
      <div className={`max-w-[80%] rounded-2xl px-5 py-3 shadow bg-white text-black`}>
        <div className="prose prose-zinc">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeHighlight]}
            components={{
              table: ({ children }) => <div className="overflow-x-scroll text-sm">{children}</div>,
            }}
          >
            {message.content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  )
}

export default ChatMessage
