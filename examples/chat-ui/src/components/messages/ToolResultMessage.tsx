import { useState } from 'react'
import { CheckCircle, ChevronDown } from 'lucide-react'
import { type ToolResultMessage } from '../../types'

interface ToolResultMessageProps {
  message: ToolResultMessage
}

const ToolResultMessage: React.FC<ToolResultMessageProps> = ({ message }) => {
  const [expanded, setExpanded] = useState(false)

  const json = JSON.stringify(message.toolResult)
  const resultPreview = json.substring(0, 48)
  const shouldTruncate = json.length > 48

  return (
    <div className="flex gap-3 py-3 px-4 bg-green-50 border border-green-200 rounded-lg">
      <div className={`flex-shrink-0 h-full ${shouldTruncate ? 'mt-1' : 'mt-2.5'}`}>
        <CheckCircle size={16} className="text-green-600" />
      </div>
      <div className="flex-grow min-w-0">
        <div className="flex items-center gap-2 mb-1 overflow-hidden">
          <span className="font-medium text-green-800 text-sm flex-shrink-0">Tool Result</span>
          <span className="text-green-600 text-sm font-mono bg-green-100 px-2 py-0.5 rounded">{message.toolName}</span>
          {!shouldTruncate && (
            <div className={`text-sm text-green-700 font-mono bg-green-100 p-2 rounded ml-auto`}>
              <span className={'truncate'}>{resultPreview}</span>
            </div>
          )}
        </div>

        {shouldTruncate && (
          <div
            className={`text-sm text-green-700 font-mono bg-green-100 p-2 rounded cursor-pointer hover:bg-green-200`}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <pre className="mt-2 whitespace-pre-wrap break-words max-h-64 overflow-y-auto">
                {JSON.stringify(message.toolResult, null, 2)}
              </pre>
            ) : (
              <div className="flex items-start justify-between">
                <span className={'truncate'}>{resultPreview}</span>
                <button className="ml-2 flex-shrink-0">{<ChevronDown size={14} />}</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default ToolResultMessage
