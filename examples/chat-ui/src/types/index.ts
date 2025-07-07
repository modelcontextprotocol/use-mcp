export interface BaseMessage {
  content: string
}

export interface UserMessage extends BaseMessage {
  role: 'user'
}

export interface SystemMessage extends BaseMessage {
  role: 'system'
}

export interface AssistantMessage extends BaseMessage {
  role: 'assistant'
  type: 'content'
}

export interface ReasoningMessage extends BaseMessage {
  role: 'assistant'
  type: 'reasoning'
  reasoningStartTime: number
  reasoningEndTime?: number
  isReasoningStreaming: boolean
}

export interface ToolCallMessage {
  role: 'tool-call'
  toolName: string
  toolArgs: Record<string, unknown>
  callId: string
}

export interface ToolResultMessage {
  role: 'tool-result'
  toolName: string
  toolArgs: Record<string, unknown>
  toolResult: any
  callId: string
}

export interface ErrorMessage {
  role: 'error'
  content: string
  timestamp: number
}

export type Message = UserMessage | SystemMessage | AssistantMessage | ReasoningMessage | ToolCallMessage | ToolResultMessage | ErrorMessage

export interface Conversation {
  id?: number
  title: string
  messages: Message[]
}

export type Theme = 'light' | 'dark' | 'system'
