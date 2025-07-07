import React, { useState, useEffect, useRef } from 'react'
import { ChevronDown, AlertCircle, X } from 'lucide-react'
import { availableModels, type Model } from '../types/models'
import { hasApiKey, setApiKey, clearApiKey } from '../utils/apiKeys'
import ApiKeyModal from './ApiKeyModal'

interface ModelSelectorProps {
  selectedModel: Model
  onModelChange: (model: Model) => void
  apiKeyUpdateTrigger: number
}

const ModelSelector: React.FC<ModelSelectorProps> = ({ selectedModel, onModelChange, apiKeyUpdateTrigger }) => {
  const [isOpen, setIsOpen] = useState(false)
  const [apiKeyModal, setApiKeyModal] = useState<{ isOpen: boolean; model: Model | null }>({
    isOpen: false,
    model: null,
  })
  const [apiKeyStatuses, setApiKeyStatuses] = useState<Record<string, boolean>>({})
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const statuses: Record<string, boolean> = {}
    availableModels.forEach((model) => {
      statuses[model.provider.id] = hasApiKey(model.provider.id)
    })
    setApiKeyStatuses(statuses)
  }, [apiKeyUpdateTrigger])

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
      setApiKeyModal({ isOpen: true, model })
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
    clearApiKey(providerId)
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
            {availableModels.map((model) => (
              <button
                key={model.id}
                onClick={() => handleModelSelect(model)}
                className="w-full flex items-center justify-between p-3 text-left hover:bg-zinc-50 first:rounded-t-lg last:rounded-b-lg"
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">{model.provider.logo}</span>
                  <div>
                    <div className="font-medium text-zinc-900">{model.name}</div>
                    <div className="text-xs text-zinc-500">{model.provider.name}</div>
                  </div>
                </div>
                {getApiKeyIcon(model.provider.id)}
              </button>
            ))}
          </div>
        )}
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

export default ModelSelector
