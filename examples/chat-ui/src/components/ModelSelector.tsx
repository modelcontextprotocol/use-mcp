import React, { useState, useEffect, useRef } from 'react'
import { ChevronDown, AlertCircle, X, Star } from 'lucide-react'
import { type Model, type Provider, providers } from '../types/models'
import { useModels } from '../hooks/useModels'
import { hasApiKey, setApiKey, clearApiKey, beginOAuthFlow, clearOAuthToken } from '../utils/auth'
import ApiKeyModal from './ApiKeyModal'
import ProviderModelsModal from './ProviderModelsModal'

interface ModelSelectorProps {
  selectedModel: Model
  onModelChange: (model: Model) => void
  apiKeyUpdateTrigger: number
  toolsAvailable?: boolean
}

const ModelSelector: React.FC<ModelSelectorProps> = ({ selectedModel, onModelChange, apiKeyUpdateTrigger, toolsAvailable = false }) => {
  const [isOpen, setIsOpen] = useState(false)
  const [apiKeyModal, setApiKeyModal] = useState<{ isOpen: boolean; model: Model | null }>({
    isOpen: false,
    model: null,
  })
  const [providerModelsModal, setProviderModelsModal] = useState<{ isOpen: boolean; provider: Provider | null }>({
    isOpen: false,
    provider: null,
  })
  const [apiKeyStatuses, setApiKeyStatuses] = useState<Record<string, boolean>>({})
  const dropdownRef = useRef<HTMLDivElement>(null)

  const { models, loading, toggleFavorite, isFavorite, getFavoriteModels } = useModels()

  useEffect(() => {
    const statuses: Record<string, boolean> = {}
    models.forEach((model) => {
      statuses[model.provider.id] = hasApiKey(model.provider.id)
    })
    setApiKeyStatuses(statuses)
  }, [apiKeyUpdateTrigger, models])

  // Handle OAuth success - show provider models when OAuth completes
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'oauth_success' && event.data.provider) {
        const provider = providers[event.data.provider as keyof typeof providers]
        if (provider) {
          setProviderModelsModal({ isOpen: true, provider })
        }
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

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

      // If this was triggered from provider selection, show the provider models
      const provider = apiKeyModal.model.provider
      setApiKeyModal({ isOpen: false, model: null })
      setProviderModelsModal({ isOpen: true, provider })
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

  const handleProviderSelect = (provider: Provider) => {
    if (provider.authType === 'oauth') {
      // Check if already authenticated
      if (hasApiKey(provider.id)) {
        // Show provider models to select from
        setProviderModelsModal({ isOpen: true, provider })
        setIsOpen(false)
      } else {
        // Start OAuth flow
        beginOAuthFlow(provider.id)
          .then(() => {
            // OAuth flow started successfully
            setIsOpen(false)
          })
          .catch((error) => {
            console.error('Failed to start OAuth flow:', error)
            alert('Failed to start authentication. Please try again.')
          })
      }
    } else {
      // Check if already has API key
      if (hasApiKey(provider.id)) {
        // Show provider models to select from
        setProviderModelsModal({ isOpen: true, provider })
        setIsOpen(false)
      } else {
        // Show API key modal first
        setApiKeyModal({ isOpen: true, model: { provider } as Model })
        setIsOpen(false)
      }
    }
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
          <div className="absolute bottom-full left-0 right-0 mb-2 bg-white border border-zinc-200 rounded-lg shadow-lg z-50">
            {/* Providers Section */}
            <div className="p-3 border-b border-zinc-200">
              <div className="text-sm font-medium text-zinc-700 mb-2">Providers</div>
              <div className="space-y-1">
                {Object.values(providers).map((provider) => (
                  <button
                    key={provider.id}
                    onClick={() => handleProviderSelect(provider)}
                    className="w-full flex items-center justify-between p-2 text-left hover:bg-zinc-50 rounded-md"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-lg">{provider.logo}</span>
                      <div>
                        <div className="font-medium text-zinc-900">{provider.name}</div>
                        <div className="text-xs text-zinc-500">{provider.authType === 'oauth' ? 'OAuth' : 'API Key'}</div>
                      </div>
                    </div>
                    {getApiKeyIcon(provider.id)}
                  </button>
                ))}
              </div>
            </div>

            {/* Starred Models Section */}
            <div className="max-h-64 overflow-y-auto">
              <div className="p-3 pb-2">
                <div className="text-sm font-medium text-zinc-700 mb-2">⭐ Starred Models</div>
              </div>

              {getFavoriteModels().length === 0 ? (
                <div className="px-3 pb-3 text-center text-zinc-500 text-sm">
                  No starred models yet. Click on a provider above to explore and star models.
                </div>
              ) : (
                <div className="pb-2">
                  {getFavoriteModels().map((model) => {
                    const isConfigured = apiKeyStatuses[model.provider.id]
                    return (
                      <button
                        key={model.id}
                        onClick={() => (isConfigured ? handleModelSelect(model) : handleProviderSelect(model.provider))}
                        className={`w-full flex items-center justify-between p-3 text-left hover:bg-zinc-50 border-b border-zinc-100 last:border-b-0 ${
                          !isConfigured ? 'opacity-50' : ''
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Star size={16} fill="currentColor" className="text-yellow-500" />
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
                        {!isConfigured && (
                          <div className="text-orange-500 p-1" title="Provider not configured">
                            <AlertCircle size={16} />
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
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

      <ProviderModelsModal
        isOpen={providerModelsModal.isOpen}
        onClose={() => setProviderModelsModal({ isOpen: false, provider: null })}
        provider={providerModelsModal.provider}
        models={models}
        favorites={[]}
        onToggleFavorite={toggleFavorite}
        isFavorite={isFavorite}
        onModelSelect={(model) => {
          onModelChange(model)
          setProviderModelsModal({ isOpen: false, provider: null })
        }}
        toolsAvailable={toolsAvailable}
      />
    </>
  )
}

export default ModelSelector
