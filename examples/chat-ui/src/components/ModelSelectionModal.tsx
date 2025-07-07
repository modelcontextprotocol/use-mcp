import React, { useState, useEffect } from 'react'
import { X, AlertCircle, CheckCircle } from 'lucide-react'
import { type Model, availableModels } from '../types/models'
import { hasApiKey, setApiKey, clearApiKey } from '../utils/apiKeys'
import ApiKeyModal from './ApiKeyModal'

interface ModelSelectionModalProps {
  isOpen: boolean
  onClose: () => void
  selectedModel: Model
  onModelChange: (model: Model) => void
  apiKeyUpdateTrigger: number
}

const ModelSelectionModal: React.FC<ModelSelectionModalProps> = ({
  isOpen,
  onClose,
  selectedModel,
  onModelChange,
  apiKeyUpdateTrigger,
}) => {
  const [apiKeyModal, setApiKeyModal] = useState<{ isOpen: boolean; model: Model | null }>({
    isOpen: false,
    model: null,
  })
  const [apiKeyStatuses, setApiKeyStatuses] = useState<Record<string, boolean>>({})

  useEffect(() => {
    const statuses: Record<string, boolean> = {}
    availableModels.forEach((model) => {
      statuses[model.provider.id] = hasApiKey(model.provider.id)
    })
    setApiKeyStatuses(statuses)
  }, [apiKeyUpdateTrigger])

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

  const handleModelSelect = (model: Model) => {
    const hasKey = hasApiKey(model.provider.id)

    if (!hasKey) {
      setApiKeyModal({ isOpen: true, model })
    } else {
      onModelChange(model)
      onClose()
    }
  }

  const handleApiKeySave = (apiKey: string) => {
    if (apiKeyModal.model) {
      setApiKey(apiKeyModal.model.provider.id, apiKey)
      setApiKeyStatuses((prev) => ({ ...prev, [apiKeyModal.model!.provider.id]: true }))
      onModelChange(apiKeyModal.model)
      setApiKeyModal({ isOpen: false, model: null })
      onClose()
    }
  }

  const handleClearApiKey = (providerId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    clearApiKey(providerId)
    setApiKeyStatuses((prev) => ({ ...prev, [providerId]: false }))
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
            <div className="space-y-3">
              {availableModels.map((model) => {
                const isSelected = model.id === selectedModel.id
                const hasKey = apiKeyStatuses[model.provider.id]

                return (
                  <div
                    key={model.id}
                    className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                      isSelected ? 'border-blue-500 bg-blue-50' : 'border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50'
                    }`}
                    onClick={() => handleModelSelect(model)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{model.provider.logo}</span>
                        <div>
                          <div className="font-medium text-zinc-900">{model.name}</div>
                          <div className="text-sm text-zinc-500">{model.provider.name}</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {getStatusIcon(model.provider.id)}
                        <span className={`text-sm ${hasKey ? 'text-green-600' : 'text-red-600'}`}>
                          {hasKey ? 'Configured' : 'Not configured'}
                        </span>
                        {hasKey && (
                          <button
                            onClick={(e) => handleClearApiKey(model.provider.id, e)}
                            className="text-zinc-400 hover:text-red-500 p-1 ml-2"
                            title="Clear API key"
                          >
                            <X size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      <ApiKeyModal
        isOpen={apiKeyModal.isOpen}
        onClose={() => setApiKeyModal({ isOpen: false, model: null })}
        provider={apiKeyModal.model?.provider ?? { id: '', name: '', baseUrl: '', apiKeyHeader: '', documentationUrl: '' }}
        onSave={handleApiKeySave}
      />
    </>
  )
}

export default ModelSelectionModal
