import { type SupportedProvider } from '../types/models'
import modelsData from '../data/models.json'

// Helper function to check if a model supports reasoning
export function supportsReasoning(providerId: SupportedProvider, modelId: string): boolean {
  const providerModels = modelsData[providerId] as Record<string, any>
  if (!providerModels) return false

  const model = providerModels[modelId]
  return model?.reasoning === true
}

// Helper function to get provider-specific options
export function getProviderOptions(providerId: SupportedProvider, modelId: string): Record<string, any> | undefined {
  // Add any provider-specific options here
  switch (providerId) {
    case 'groq':
      // Handle specific Groq model options - set reasoningFormat for all reasoning models
      if (supportsReasoning(providerId, modelId)) {
        return {
          groq: {
            reasoningFormat: 'parsed',
          },
        }
      }
      break
    case 'anthropic':
      // Handle specific Anthropic model options
      break
    case 'openrouter':
      // Handle specific OpenRouter model options
      break
  }
  return undefined
}
