import React from 'react'
import { type AssistantMessage } from '../../types'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'

interface AssistantMessageProps {
  message: AssistantMessage
}

const AssistantMessage: React.FC<AssistantMessageProps> = ({ message }) => {
  return (
    <div className={`flex justify-start`}>
      <div className={`text-zinc-900 w-full`}>
        <div className="prose prose-zinc prose-tight">
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

export default AssistantMessage
