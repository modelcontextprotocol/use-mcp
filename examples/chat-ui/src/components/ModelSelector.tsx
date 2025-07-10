import React, { useState, useEffect, useRef } from 'react'
import { ChevronDown, AlertCircle, X, Star, Search } from 'lucide-react'
import { type Model } from '../types/models'
import { useModels } from '../hooks/useModels'
import { hasApiKey, setApiKey, clearApiKey, beginOAuthFlow, clearOAuthToken } from '../utils/auth'
import ApiKeyModal from './ApiKeyModal'

interface ModelSelectorProps {
  selectedModel: Model
  onModelChange: (model: Model) => void
  apiKeyUpdateTrigger: number
  toolsAvailable?: boolean
}

const ModelSelector: React.FC<ModelSelectorProps> = ({ selectedModel, onModelChange, apiKeyUpdateTrigger, toolsAvailable = false }) => {
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false)
  const [showToolsOnly, setShowToolsOnly] = useState(false)
  const [apiKeyModal, setApiKeyModal] = useState<{ isOpen: boolean; model: Model | null }>({
    isOpen: false,
    model: null,
  })
  const [apiKeyStatuses, setApiKeyStatuses] = useState<Record<string, boolean>>({})
  const dropdownRef = useRef<HTMLDivElement>(null)

  const { models, loading, toggleFavorite, isFavorite } = useModels()

  useEffect(() => {
    const statuses: Record<string, boolean> = {}
    models.forEach((model) => {
      statuses[model.provider.id] = hasApiKey(model.provider.id)
    })
    setApiKeyStatuses(statuses)
  }, [apiKeyUpdateTrigger, models])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const handleModelSelect = (model: Model) => {
    const hasKey = hasApiKey(model.provider.id)

    if (!hasKey) {
      if (model.provider.authType === 'oauth') {
        // Start OAuth flow
        beginOAuthFlow(model.provider.id)
          .then(() => {
            // OAuth flow started successfully
            setIsOpen(false)
          })
          .catch((error) => {
            console.error('Failed to start OAuth flow:', error)
            alert('Failed to start authentication. Please try again.')
          })
      } else {
        // Show API key modal
        setApiKeyModal({ isOpen: true, model })
      }
    } else {
      onModelChange(model)
    }
    setIsOpen(false)
  }

  const handleApiKeySave = (apiKey: string) => {
    if (apiKeyModal.model) {
      setApiKey(apiKeyModal.model.provider.id, apiKey)
      setApiKeyStatuses((prev) => ({ ...prev, [apiKeyModal.model!.provider.id]: true }))
      onModelChange(apiKeyModal.model)
    }
  }

  const handleClearApiKey = (providerId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const provider = models.find((m) => m.provider.id === providerId)?.provider
    if (provider?.authType === 'oauth') {
      clearOAuthToken(providerId as any)
    } else {
      clearApiKey(providerId as any)
    }
    setApiKeyStatuses((prev) => ({ ...prev, [providerId]: false }))
  }

  const getApiKeyIcon = (providerId: string) => {
    const hasKey = apiKeyStatuses[providerId]

    if (hasKey) {
      return (
        <button onClick={(e) => handleClearApiKey(providerId, e)} className="text-zinc-400 hover:text-red-500 p-1" title="Clear token">
          <X size={14} />
        </button>
      )
    } else {
      return (
        <div className="text-red-500 p-1" title="API Key not found">
          <AlertCircle size={14} />
        </div>
      )
    }
  }

  const getFilteredModels = () => {
    let filteredModels = models

    // Filter by search term
    if (searchTerm) {
      filteredModels = filteredModels.filter(
        (model) =>
          model.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          model.provider.name.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    // Filter by favorites
    if (showFavoritesOnly) {
      filteredModels = filteredModels.filter((model) => isFavorite(model.id))
    }

    // Filter by tool support
    if (showToolsOnly) {
      filteredModels = filteredModels.filter((model) => model.supportsTools)
    }

    return filteredModels
  }

  const handleStarClick = (modelId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    toggleFavorite(modelId)
  }

  if (loading) {
    return <div className="w-full p-3 text-center text-zinc-500">Loading models...</div>
  }

  return (
    <>
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-between p-3 text-left bg-white border border-zinc-200 rounded-lg hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <div className="flex items-center gap-2">
            <span className="text-lg">{selectedModel.provider.logo}</span>
            <div>
              <div className="font-medium text-zinc-900">{selectedModel.name}</div>
              <div className="text-xs text-zinc-500">{selectedModel.provider.name}</div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {getApiKeyIcon(selectedModel.provider.id)}
            <ChevronDown size={16} className={`text-zinc-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </div>
        </button>

        {isOpen && (
          <div className="absolute bottom-full left-0 right-0 mb-2 bg-white border border-zinc-200 rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto">
            {/* Search and filters */}
            <div className="p-3 border-b border-zinc-200">
              <div className="relative mb-3">
                <Search size={16} className="absolute left-3 top-2.5 text-zinc-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search models..."
                  className="w-full pl-10 pr-3 py-2 text-sm border border-zinc-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
                  className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                    showFavoritesOnly
                      ? 'bg-blue-100 text-blue-700 border-blue-300'
                      : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'
                  }`}
                >
                  ⭐ Favorites
                </button>

                {toolsAvailable && (
                  <button
                    onClick={() => setShowToolsOnly(!showToolsOnly)}
                    className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                      showToolsOnly
                        ? 'bg-green-100 text-green-700 border-green-300'
                        : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'
                    }`}
                  >
                    🔧 Tools Only
                  </button>
                )}
              </div>
            </div>

            {/* Models list */}
            <div className="max-h-64 overflow-y-auto">
              {getFilteredModels().map((model) => (
                <button
                  key={model.id}
                  onClick={() => handleModelSelect(model)}
                  className="w-full flex items-center justify-between p-3 text-left hover:bg-zinc-50 border-b border-zinc-100 last:border-b-0"
                >
                  <div className="flex items-center gap-3">
                    <button
                      onClick={(e) => handleStarClick(model.id, e)}
                      className={`transition-colors ${isFavorite(model.id) ? 'text-yellow-500' : 'text-zinc-300 hover:text-yellow-400'}`}
                    >
                      <Star size={16} fill={isFavorite(model.id) ? 'currentColor' : 'none'} />
                    </button>

                    <span className="text-lg">{model.provider.logo}</span>

                    <div className="flex-1">
                      <div className="font-medium text-zinc-900">{model.name}</div>
                      <div className="text-xs text-zinc-500 flex items-center gap-1">
                        {model.provider.name}
                        {model.supportsTools && <span className="text-green-600">🔧</span>}
                        {model.reasoning && <span className="text-purple-600">🧠</span>}
                      </div>
                    </div>
                  </div>
                  {getApiKeyIcon(model.provider.id)}
                </button>
              ))}

              {getFilteredModels().length === 0 && (
                <div className="p-4 text-center text-zinc-500 text-sm">No models found matching your criteria</div>
              )}
            </div>
          </div>
        )}
      </div>

      <ApiKeyModal
        isOpen={apiKeyModal.isOpen}
        onClose={() => setApiKeyModal({ isOpen: false, model: null })}
        provider={
          apiKeyModal.model?.provider ?? {
            id: 'unknown' as any,
            name: 'Unknown',
            baseUrl: '',
            logo: '',
            documentationUrl: '',
            authType: 'apiKey',
            apiKeyHeader: '',
          }
        }
        onSave={handleApiKeySave}
      />
    </>
  )
}

export default ModelSelector
