import { useState, useEffect, useCallback } from 'react'
import { Model, providers, SUPPORTED_PROVIDERS, FAVORITES_KEY } from '../types/models'

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
          const parsed = JSON.parse(saved)
          setFavorites(parsed)
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
    // Only save if favorites array has been loaded (not during initial state)
    if (loading) return

    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites))
    } catch (error) {
      console.error('Failed to save favorites to localStorage:', error)
    }
  }, [favorites, loading])

  const toggleFavorite = useCallback((modelId: string) => {
    setFavorites((prev) => {
      if (prev.includes(modelId)) {
        return prev.filter((id) => id !== modelId)
      } else {
        return [...prev, modelId]
      }
    })
  }, [])

  const addToFavorites = useCallback((modelId: string) => {
    setFavorites((prev) => {
      if (!prev.includes(modelId)) {
        return [...prev, modelId]
      }
      return prev
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
    addToFavorites,
    isFavorite,
    getFavoriteModels,
    getToolSupportingModels,
  }
}
