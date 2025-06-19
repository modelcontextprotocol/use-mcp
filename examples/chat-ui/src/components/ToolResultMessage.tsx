import { useState } from 'react'
import { ChevronDown, ChevronRight, CheckCircle } from 'lucide-react'
import { type ToolResultMessage } from '../types'

interface ToolResultMessageProps {
  message: ToolResultMessage
}

const ToolResultMessage: React.FC<ToolResultMessageProps> = ({ message }) => {
  const [expanded, setExpanded] = useState(false)

  const resultPreview = JSON.stringify(message.toolResult).substring(0, 100)
  const shouldTruncate = JSON.stringify(message.toolResult).length > 100

  return (
    <div className="flex gap-3 py-3 px-4 bg-green-50 border border-green-200 rounded-lg">
      <div className="flex-shrink-0 mt-1">
        <CheckCircle size={16} className="text-green-600" />
      </div>
      <div className="flex-grow min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium text-green-800 text-sm">Tool Result</span>
          <span className="text-green-600 text-sm font-mono bg-green-100 px-2 py-0.5 rounded">
            {message.toolName}
          </span>
        </div>
        
        <div 
          className={`text-sm text-green-700 font-mono bg-green-100 p-2 rounded ${shouldTruncate ? 'cursor-pointer hover:bg-green-200' : ''}`}
          onClick={() => shouldTruncate && setExpanded(!expanded)}
        >
          <div className="flex items-start justify-between">
            <span className={expanded ? '' : 'truncate'}>
              {expanded ? JSON.stringify(message.toolResult, null, 2) : `${resultPreview}${shouldTruncate ? '...' : ''}`}
            </span>
            {shouldTruncate && (
              <button className="ml-2 flex-shrink-0">
                {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
            )}
          </div>
          {expanded && shouldTruncate && (
            <pre className="mt-2 whitespace-pre-wrap break-words max-h-64 overflow-y-auto">
              {JSON.stringify(message.toolResult, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </div>
  )
}

export default ToolResultMessage
