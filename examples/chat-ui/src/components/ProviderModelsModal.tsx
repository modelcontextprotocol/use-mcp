import React, { useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Star, Search } from 'lucide-react'
import { type Model, type Provider } from '../types/models'

interface ProviderModelsModalProps {
  isOpen: boolean
  onClose: () => void
  provider: Provider | null
  models: Model[]
  favorites: string[]
  onToggleFavorite: (modelId: string) => void
  isFavorite: (modelId: string) => boolean
  onModelSelect: (model: Model) => void
  toolsAvailable?: boolean
}

const ProviderModelsModal: React.FC<ProviderModelsModalProps> = ({
  isOpen,
  onClose,
  provider,
  models,
  onToggleFavorite,
  isFavorite,
  onModelSelect,
  toolsAvailable = false,
}) => {
  const [searchTerm, setSearchTerm] = useState('')
  const [showToolsOnly, setShowToolsOnly] = useState(false)

  if (!isOpen || !provider) return null

  const providerModels = models.filter((model) => model.provider.id === provider.id)

  const filteredModels = providerModels.filter((model) => {
    const matchesSearch = model.name.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesTools = !showToolsOnly || model.supportsTools
    return matchesSearch && matchesTools
  })

  const handleStarClick = (modelId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    onToggleFavorite(modelId)
  }

  const modalContent = (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-200">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{provider.logo}</span>
            <div>
              <h2 className="text-lg font-semibold text-zinc-900">{provider.name} Models</h2>
              <p className="text-sm text-zinc-500">Select models to add to your favorites</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-zinc-400 hover:text-zinc-600 rounded-md hover:bg-zinc-100">
            <X size={20} />
          </button>
        </div>

        {/* Search and Filters */}
        <div className="p-4 border-b border-zinc-200">
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

          {toolsAvailable && (
            <button
              onClick={() => setShowToolsOnly(!showToolsOnly)}
              className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                showToolsOnly ? 'bg-green-100 text-green-700 border-green-300' : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'
              }`}
            >
              🔧 Tools Only
            </button>
          )}
        </div>

        {/* Models List */}
        <div className="max-h-96 overflow-y-auto">
          {filteredModels.length === 0 ? (
            <div className="p-8 text-center text-zinc-500">No models found matching your criteria</div>
          ) : (
            filteredModels.map((model) => (
              <div
                key={model.id}
                className="flex items-center justify-between p-4 border-b border-zinc-100 last:border-b-0 hover:bg-zinc-50"
              >
                <div className="flex items-center gap-3 flex-1">
                  <button
                    onClick={(e) => handleStarClick(model.id, e)}
                    className={`transition-colors ${isFavorite(model.id) ? 'text-yellow-500' : 'text-zinc-300 hover:text-yellow-400'}`}
                  >
                    <Star size={18} fill={isFavorite(model.id) ? 'currentColor' : 'none'} />
                  </button>

                  <div className="flex-1">
                    <div className="font-medium text-zinc-900">{model.name}</div>
                    <div className="text-sm text-zinc-500 flex items-center gap-2">
                      {model.supportsTools && <span className="text-green-600">🔧 Tools</span>}
                      {model.reasoning && <span className="text-purple-600">🧠 Reasoning</span>}
                      {model.attachment && <span className="text-blue-600">📎 Attachments</span>}
                      <span className="text-zinc-400">•</span>
                      <span>{(model.contextLimit / 1000).toFixed(0)}K context</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => onModelSelect(model)}
                  className="px-3 py-1 text-sm bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
                >
                  Select
                </button>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-200 bg-zinc-50">
          <div className="text-sm text-zinc-600">
            {filteredModels.length} model{filteredModels.length !== 1 ? 's' : ''} available
            {toolsAvailable && showToolsOnly && ' with tool support'}
          </div>
        </div>
      </div>
    </div>
  )

  return createPortal(modalContent, document.body)
}

export default ProviderModelsModal
