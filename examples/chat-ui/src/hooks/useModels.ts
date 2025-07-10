import { useState, useEffect, useCallback } from 'react'
import { Model, providers, SupportedProvider, SUPPORTED_PROVIDERS, FAVORITES_KEY } from '../types/models'

// Load models data from generated JSON
import modelsData from '../data/models.json'

export function useModels() {
  const [models, setModels] = useState<Model[]>([])
  const [favorites, setFavorites] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  // Load models from data and favorites from localStorage
  useEffect(() => {
    const loadModels = () => {
      const allModels: Model[] = []

      // Process each provider's models
      for (const providerId of SUPPORTED_PROVIDERS) {
        const provider = providers[providerId]
        const providerModels = modelsData[providerId] || {}

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
            providerOptions: getProviderOptions(providerId, modelId),
          }
          allModels.push(model)
        }
      }

      setModels(allModels)
      setLoading(false)
    }

    const loadFavorites = () => {
      try {
        const saved = localStorage.getItem(FAVORITES_KEY)
        if (saved) {
          setFavorites(JSON.parse(saved))
        }
      } catch (error) {
        console.error('Failed to load favorites from localStorage:', error)
      }
    }

    loadModels()
    loadFavorites()
  }, [])

  // Save favorites to localStorage when they change
  useEffect(() => {
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites))
    } catch (error) {
      console.error('Failed to save favorites to localStorage:', error)
    }
  }, [favorites])

  const toggleFavorite = useCallback((modelId: string) => {
    setFavorites((prev) => {
      if (prev.includes(modelId)) {
        return prev.filter((id) => id !== modelId)
      } else {
        return [...prev, modelId]
      }
    })
  }, [])

  const isFavorite = useCallback(
    (modelId: string) => {
      return favorites.includes(modelId)
    },
    [favorites]
  )

  const getFavoriteModels = useCallback(() => {
    return models.filter((model) => favorites.includes(model.id))
  }, [models, favorites])

  const getToolSupportingModels = useCallback(() => {
    return models.filter((model) => model.supportsTools)
  }, [models])

  return {
    models,
    favorites,
    loading,
    toggleFavorite,
    isFavorite,
    getFavoriteModels,
    getToolSupportingModels,
  }
}

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
