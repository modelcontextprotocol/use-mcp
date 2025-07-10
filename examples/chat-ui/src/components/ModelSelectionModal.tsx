import React, { useState, useEffect } from 'react'
import { X, AlertCircle, CheckCircle, Star } from 'lucide-react'
import { type Model, type Provider, providers } from '../types/models'
import { hasApiKey, setApiKey, clearApiKey, beginOAuthFlow } from '../utils/auth'
import ApiKeyModal from './ApiKeyModal'
import ProviderModelsModal from './ProviderModelsModal'

interface ModelSelectionModalProps {
  isOpen: boolean
  onClose: () => void
  selectedModel: Model
  onModelChange: (model: Model) => void
  apiKeyUpdateTrigger: number
  addToFavorites: (modelId: string) => void
  models: Model[]
  toggleFavorite: (modelId: string) => void
  isFavorite: (modelId: string) => boolean
  getFavoriteModels: () => Model[]
}

const ModelSelectionModal: React.FC<ModelSelectionModalProps> = ({
  isOpen,
  onClose,
  selectedModel,
  onModelChange,
  apiKeyUpdateTrigger,
  addToFavorites,
  models,
  toggleFavorite,
  isFavorite,
  getFavoriteModels,
}) => {
  const [apiKeyModal, setApiKeyModal] = useState<{ isOpen: boolean; model: Model | null }>({
    isOpen: false,
    model: null,
  })
  const [providerModelsModal, setProviderModelsModal] = useState<{ isOpen: boolean; provider: Provider | null }>({
    isOpen: false,
    provider: null,
  })
  const [apiKeyStatuses, setApiKeyStatuses] = useState<Record<string, boolean>>({})
  // Remove the local useModels hook - we now get everything from props

  useEffect(() => {
    const statuses: Record<string, boolean> = {}
    models.forEach((model) => {
      statuses[model.provider.id] = hasApiKey(model.provider.id)
    })
    setApiKeyStatuses(statuses)
  }, [apiKeyUpdateTrigger, models])

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }

    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  // Handle OAuth success - show provider models when OAuth completes
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'oauth_success' && event.data.provider && isOpen) {
        const provider = providers[event.data.provider as keyof typeof providers]
        if (provider) {
          setProviderModelsModal({ isOpen: true, provider })
        }
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [isOpen])

  const handleApiKeySave = (apiKey: string) => {
    if (apiKeyModal.model) {
      setApiKey(apiKeyModal.model.provider.id, apiKey)
      setApiKeyStatuses((prev) => ({ ...prev, [apiKeyModal.model!.provider.id]: true }))

      // Show provider models after API key is saved
      const provider = apiKeyModal.model.provider
      setApiKeyModal({ isOpen: false, model: null })
      setProviderModelsModal({ isOpen: true, provider })
    }
  }

  const handleClearApiKey = (providerId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    clearApiKey(providerId as any)
    setApiKeyStatuses((prev) => ({ ...prev, [providerId]: false }))
  }

  const handleProviderSelect = (provider: Provider) => {
    if (provider.authType === 'oauth') {
      // Check if already authenticated
      if (hasApiKey(provider.id)) {
        // Show provider models to select from
        setProviderModelsModal({ isOpen: true, provider })
      } else {
        // Start OAuth flow
        beginOAuthFlow(provider.id)
          .then(() => {
            // OAuth flow started successfully - modal will be shown via OAuth success handler
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
      } else {
        // Show API key modal first
        setApiKeyModal({ isOpen: true, model: { provider } as Model })
      }
    }
  }

  const getStatusIcon = (providerId: string) => {
    const hasKey = apiKeyStatuses[providerId]

    if (hasKey) {
      return <CheckCircle size={20} className="text-green-500" />
    } else {
      return <AlertCircle size={20} className="text-red-500" />
    }
  }

  if (!isOpen) return null

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}
        onClick={onClose}
      >
        <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between p-6 border-b border-zinc-200">
            <h2 className="text-xl font-semibold text-zinc-900">Select Model</h2>
            <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 p-1 cursor-pointer">
              <X size={24} />
            </button>
          </div>

          <div className="p-6 overflow-y-auto">
            {/* Providers Section */}
            <div className="mb-6">
              <h3 className="text-lg font-medium text-zinc-900 mb-3">Providers</h3>
              <div className="space-y-2">
                {Object.values(providers).map((provider) => (
                  <div
                    key={provider.id}
                    className="border rounded-lg p-4 cursor-pointer transition-colors hover:border-zinc-300 hover:bg-zinc-50"
                    onClick={() => handleProviderSelect(provider)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{provider.logo}</span>
                        <div>
                          <h4 className="font-medium text-zinc-900">{provider.name}</h4>
                          <p className="text-sm text-zinc-500">
                            {provider.authType === 'oauth' ? 'OAuth Authentication' : 'API Key Authentication'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {getStatusIcon(provider.id)}
                        {apiKeyStatuses[provider.id] && (
                          <button
                            onClick={(e) => handleClearApiKey(provider.id, e)}
                            className="text-zinc-400 hover:text-red-500 p-1"
                            title="Clear credentials"
                          >
                            <X size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Starred Models Section */}
            <div>
              <h3 className="text-lg font-medium text-zinc-900 mb-3 flex items-center gap-2">
                <Star size={18} className="text-yellow-500" />
                Starred Models
              </h3>
              {getFavoriteModels().length === 0 ? (
                <div className="text-center py-8 text-zinc-500">
                  <Star size={48} className="mx-auto mb-3 text-zinc-300" />
                  <p className="text-lg font-medium">No starred models yet</p>
                  <p className="text-sm">Click on a provider above to explore and star models</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {getFavoriteModels().map((model) => {
                    const isConfigured = apiKeyStatuses[model.provider.id]
                    const isSelected = model.id === selectedModel.id
                    return (
                      <div
                        key={model.id}
                        className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                          isSelected
                            ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                            : 'border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50'
                        } ${!isConfigured ? 'opacity-50' : ''}`}
                        onClick={() => {
                          if (isConfigured) {
                            onModelChange(model)
                            addToFavorites(model.id)
                          } else {
                            handleProviderSelect(model.provider)
                          }
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Star size={16} fill="currentColor" className="text-yellow-500" />
                            {isSelected && <span className="text-blue-500">✓</span>}
                            <span className="text-lg">{model.provider.logo}</span>
                            <div>
                              <h4 className="font-medium text-zinc-900">{model.name}</h4>
                              <div className="text-sm text-zinc-500 flex items-center gap-2">
                                {model.provider.name}
                                {model.supportsTools && <span className="text-green-600">🔧</span>}
                                {model.reasoning && <span className="text-purple-600">🧠</span>}
                                {model.attachment && <span className="text-blue-600">📎</span>}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {!isConfigured && (
                              <div title="Provider not configured">
                                <AlertCircle size={16} className="text-orange-500" />
                              </div>
                            )}
                            {isConfigured && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  onModelChange(model)
                                  onClose()
                                }}
                                className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
                              >
                                Select
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
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
          addToFavorites(model.id)
          setProviderModelsModal({ isOpen: false, provider: null })
          onClose()
        }}
        toolsAvailable={false}
      />
    </>
  )
}

export default ModelSelectionModal
