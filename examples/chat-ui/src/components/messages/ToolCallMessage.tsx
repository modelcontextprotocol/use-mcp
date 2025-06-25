import { useState } from 'react'
import { ChevronDown, Wrench } from 'lucide-react'
import { type ToolCallMessage } from '../../types'

interface ToolCallMessageProps {
  message: ToolCallMessage
}

const ToolCallMessage: React.FC<ToolCallMessageProps> = ({ message }) => {
  const [expanded, setExpanded] = useState(false)

  const json = JSON.stringify(message.toolArgs)
  const argsPreview = json.substring(0, 100)
  const shouldTruncate = json.length > 100

  return (
    <div className="flex gap-3 py-2 px-4 bg-blue-50 border border-blue-200 rounded-lg">
      <div className={`flex-shrink-0 h-full ${shouldTruncate ? 'mt-1' : 'mt-2.5'}`}>
        <Wrench size={16} className="text-blue-600" />
      </div>
      <div className="flex-grow min-w-0">
        <div className="flex items-center gap-2 mb-1 overflow-hidden">
          <span className="font-medium text-blue-800 text-sm flex-shrink-0">Tool Call</span>
          <span className="text-blue-600 text-sm font-mono bg-blue-100 px-2 py-0.5 rounded">{message.toolName}</span>
          {!shouldTruncate && (
            <div className={`text-sm text-blue-700 font-mono bg-blue-100 p-2 rounded ml-auto`}>
              <span className={'truncate'}>{argsPreview}</span>
            </div>
          )}
        </div>

        {shouldTruncate && (
          <div
            className={`text-sm text-blue-700 font-mono bg-blue-100 p-2 rounded cursor-pointer hover:bg-blue-200`}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <pre className="mt-2 whitespace-pre-wrap break-words max-h-64 overflow-y-auto">
                {JSON.stringify(message.toolArgs, null, 2)}
              </pre>
            ) : (
              <div className="flex items-start justify-between">
                <span className={'truncate'}>{argsPreview}</span>
                <button className="ml-2 flex-shrink-0">{<ChevronDown size={14} />}</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default ToolCallMessage
