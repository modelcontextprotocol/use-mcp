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
  providerOptions?: any
}

export const providers: Record<string, ModelProvider> = {
  groq: {
    id: 'groq',
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    apiKeyHeader: 'Authorization',
    documentationUrl: 'https://console.groq.com/docs',
    logo: '🚀',
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    apiKeyHeader: 'x-api-key',
    documentationUrl: 'https://docs.anthropic.com/',
    logo: '🤖',
  },
}

export const availableModels: Model[] = [
  {
    id: 'llama-4-maverick-17b-128e-instruct',
    name: 'Llama 4 Maverick 17B',
    provider: providers.groq,
    modelId: 'meta-llama/llama-4-maverick-17b-128e-instruct',
  },
  {
    id: 'qwen-3-32b',
    name: 'Qwen3 32B',
    provider: providers.groq,
    modelId: 'qwen/qwen3-32b',
    providerOptions: {
      groq: {
        reasoningFormat: 'parsed',
      },
    },
  },
  // {
  //   id: 'qwen-qwq-32b',
  //   name: 'Qwen QwQ 32B (Reasoning)',
  //   provider: providers.groq,
  //   modelId: 'qwen-qwq-32b',
  // },
  // {
  //   id: 'deepseek-r1-distill-llama-70b',
  //   name: 'DeepSeek R1 Distil Llama 70B (Reasoning)',
  //   provider: providers.groq,
  //   modelId: 'deepseek-r1-distill-llama-70b',
  // },
  {
    id: 'claude-4-sonnet-20250514',
    name: 'Claude 4 Sonnet',
    provider: providers.anthropic,
    modelId: 'claude-4-sonnet-20250514',
  },
]
