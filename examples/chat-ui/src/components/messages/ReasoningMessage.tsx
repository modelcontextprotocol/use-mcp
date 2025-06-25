import React, { useEffect, useState } from 'react'
import { type ReasoningMessage } from '../../types'

interface ReasoningMessageProps {
  message: ReasoningMessage
}

const ReasoningMessage: React.FC<ReasoningMessageProps> = ({ message }) => {
  const [isExpanded, setIsExpanded] = useState(message.isReasoningStreaming) // Start expanded when streaming

  // Auto-collapse instantly when streaming finishes
  useEffect(() => {
    if (!message.isReasoningStreaming && message.reasoningStartTime && message.reasoningEndTime) {
      setIsExpanded(false)
    }
  }, [message.isReasoningStreaming, message.reasoningStartTime, message.reasoningEndTime])

  if (!message.content || message.content.trim().length === 0) {
    return null
  }

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded)
  }

  // Calculate thinking duration
  const duration =
    message.reasoningStartTime && message.reasoningEndTime ? (message.reasoningEndTime - message.reasoningStartTime) / 1000 : null

  // Format duration nicely
  const formatDuration = (seconds: number) => {
    if (seconds < 1) {
      return `${Math.round(seconds * 1000)}ms`
    }
    return `${seconds.toFixed(1)}s`
  }

  return (
    <div className={`flex justify-start`}>
      <div className={`text-zinc-900 w-full`}>
        <div
          className={`text-xs/5 text-zinc-600 border opacity-80 hover:opacity-100 border-zinc-200 rounded-lg p-3 bg-zinc-50 cursor-pointer hover:bg-zinc-100 transition-all duration-300 ${
            isExpanded ? 'border-zinc-300 opacity-100' : ''
          }`}
          onClick={toggleExpanded}
        >
          <div className="flex items-start gap-2">
            <span className="text-zinc-400 text-xs mt-0.5 flex-shrink-0">💭</span>

            {isExpanded ? (
              // Expanded view: show reasoning content
              <div
                className={`flex-1 ${message.isReasoningStreaming ? 'overflow-hidden whitespace-nowrap flex justify-end' : 'whitespace-pre-wrap'}`}
              >
                <span className={message.isReasoningStreaming ? 'inline-block' : ''}>
                  {message.content}
                  {message.isReasoningStreaming && <span className="inline-block w-2 h-4 bg-zinc-400 ml-1 animate-pulse"></span>}
                </span>
              </div>
            ) : (
              // Collapsed view: show timing summary
              <div className="flex-1">
                <span className="text-zinc-500">
                  {message.isReasoningStreaming ? 'Thinking...' : duration ? `Thought for ${formatDuration(duration)}` : 'Thought process'}
                </span>
              </div>
            )}

            <button
              className="text-zinc-400 hover:text-zinc-600 text-xs ml-auto flex-shrink-0"
              onClick={(e) => {
                e.stopPropagation()
                toggleExpanded()
              }}
            >
              {/*{isExpanded ? '↑' : '↓'}*/}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ReasoningMessage
