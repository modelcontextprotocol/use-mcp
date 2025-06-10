import { availableModels, type Model } from '../types/models'

const MODEL_PREFERENCE_KEY = 'aiChatTemplate_selectedModel'

export const getSelectedModel = (): Model => {
  const saved = localStorage.getItem(MODEL_PREFERENCE_KEY)
  if (saved) {
    try {
      const parsed = JSON.parse(saved)
      // Find the model by ID to ensure it still exists
      const model = availableModels.find(m => m.id === parsed.id)
      if (model) {
        return model
      }
    } catch (e) {
      console.warn('Failed to parse saved model preference:', e)
    }
  }
  // Default to first available model
  return availableModels[0]
}

export const setSelectedModel = (model: Model): void => {
  localStorage.setItem(MODEL_PREFERENCE_KEY, JSON.stringify({ id: model.id }))
}
