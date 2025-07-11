import { type Model, providers, type SupportedProvider } from '../types/models'

// Import models data directly
import modelsData from '../data/models.json'

// Helper function to get provider-specific options
function getProviderOptions(providerId: SupportedProvider, modelId: string) {
  // Add any provider-specific options here
  switch (providerId) {
    case 'groq':
      // Handle specific Groq model options
      if (modelId === 'qwen/qwen3-32b') {
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

const MODEL_PREFERENCE_KEY = 'aiChatTemplate_selectedModel'

function getAvailableModels(): Model[] {
  const models: Model[] = []
  for (const [providerId, providerModels] of Object.entries(modelsData)) {
    const provider = providers[providerId as keyof typeof providers]
    if (!provider) continue

    for (const [modelId, modelData] of Object.entries(providerModels)) {
      const model: Model = {
        id: `${providerId}:${modelId}`,
        name: modelData.name,
        provider,
        modelId,
        supportsTools: modelData.tool_call,
        reasoning: modelData.reasoning,
        attachment: modelData.attachment,
        contextLimit: modelData.limit.context,
        outputLimit: modelData.limit.output,
        cost: modelData.cost,
        providerOptions: getProviderOptions(providerId as any, modelId),
      }
      models.push(model)
    }
  }
  return models
}

export const getSelectedModel = (): Model => {
  const saved = localStorage.getItem(MODEL_PREFERENCE_KEY)
  if (saved) {
    try {
      const parsed = JSON.parse(saved)
      // Find the model by ID to ensure it still exists
      const availableModels = getAvailableModels()
      const model = availableModels.find((m) => m.id === parsed.id)
      if (model) {
        return model
      }
    } catch (e) {
      console.warn('Failed to parse saved model preference:', e)
    }
  }
  // Default to first available model
  const availableModels = getAvailableModels()
  return availableModels[0]
}

export const setSelectedModel = (model: Model): void => {
  localStorage.setItem(MODEL_PREFERENCE_KEY, JSON.stringify({ id: model.id }))
}
