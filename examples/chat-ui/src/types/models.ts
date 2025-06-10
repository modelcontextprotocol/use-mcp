export interface ModelProvider {
  id: string
  name: string
  baseUrl: string
  apiKeyHeader: string
  documentationUrl: string
  logo?: string
}

export interface Model {
  id: string
  name: string
  provider: ModelProvider
  modelId: string
}

export const providers: Record<string, ModelProvider> = {
  groq: {
    id: 'groq',
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    apiKeyHeader: 'Authorization',
    documentationUrl: 'https://console.groq.com/docs',
    logo: '🚀'
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    apiKeyHeader: 'x-api-key',
    documentationUrl: 'https://docs.anthropic.com/',
    logo: '🤖'
  }
}

export const availableModels: Model[] = [
  {
    id: 'llama-3.3-70b-versatile',
    name: 'Llama 3.3 70B Versatile',
    provider: providers.groq,
    modelId: 'llama-3.3-70b-versatile'
  },
  {
    id: 'claude-3-5-sonnet-20241022',
    name: 'Claude 4 Sonnet',
    provider: providers.anthropic,
    modelId: 'claude-3-5-sonnet-20241022'
  }
]
