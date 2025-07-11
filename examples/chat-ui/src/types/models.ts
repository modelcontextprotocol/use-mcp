// Types for models.dev API data
export interface ModelData {
  id: string
  name: string
  attachment: boolean
  reasoning: boolean
  temperature: boolean
  tool_call: boolean
  knowledge: string
  release_date: string
  last_updated: string
  modalities: {
    input: string[]
    output: string[]
  }
  open_weights: boolean
  limit: {
    context: number
    output: number
  }
  cost?: {
    input: number
    output: number
    cache_read?: number
    cache_write?: number
  }
}

export type SupportedProvider = 'anthropic' | 'groq' | 'openrouter'

export interface Provider {
  id: SupportedProvider
  name: string
  baseUrl: string
  logo: string
  documentationUrl: string
  authType: 'apiKey' | 'oauth'
  apiKeyHeader?: string
  oauth?: {
    authorizeUrl: string
    tokenUrl: string
  }
}

export interface Model {
  id: string
  name: string
  provider: Provider
  modelId: string
  supportsTools: boolean
  reasoning: boolean
  attachment: boolean
  contextLimit: number
  outputLimit: number
  cost?: {
    input: number
    output: number
    cache_read?: number
    cache_write?: number
  }
}

export const providers: Record<SupportedProvider, Provider> = {
  groq: {
    id: 'groq',
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    logo: '🚀',
    documentationUrl: 'https://console.groq.com/docs',
    apiKeyHeader: 'Authorization',
    authType: 'oauth',
    oauth: {
      authorizeUrl: 'http://localhost:3000/keys/request',
      tokenUrl: 'http://localhost:3000/keys/request/exchange',
    },
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    logo: '🤖',
    documentationUrl: 'https://docs.anthropic.com/',
    authType: 'apiKey',
    apiKeyHeader: 'x-api-key',
  },
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    logo: '🌐',
    documentationUrl: 'https://openrouter.ai/docs',
    authType: 'oauth',
    oauth: {
      authorizeUrl: 'https://openrouter.ai/auth',
      tokenUrl: 'https://openrouter.ai/api/v1/auth/keys',
    },
  },
}

export const SUPPORTED_PROVIDERS: readonly SupportedProvider[] = ['anthropic', 'groq', 'openrouter']

// Storage keys for user preferences
export const FAVORITES_KEY = 'aiChatTemplate_favorites_v1'
export const PROVIDER_TOKEN_KEY_PREFIX = 'aiChatTemplate_token_'
