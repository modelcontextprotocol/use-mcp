import React from 'react'
import { type ReasoningMessage } from '../../types'
import ReasoningBlock from './ReasoningBlock.tsx'

interface ReasoningMessageProps {
  message: ReasoningMessage
}

const ReasoningMessage: React.FC<ReasoningMessageProps> = ({ message }) => {
  console.log({ ReasoningMessage: message })
  return (
    <div className={`flex justify-start`}>
      <div className={`text-zinc-900 w-full`}>
        <ReasoningBlock
          reasoning={message.content}
          isStreaming={message.isReasoningStreaming}
          startTime={message.reasoningStartTime}
          endTime={message.reasoningEndTime}
        />
      </div>
    </div>
  )
}

export default ReasoningMessage
