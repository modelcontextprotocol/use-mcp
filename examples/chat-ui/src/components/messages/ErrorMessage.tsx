import React, { useState } from 'react'

interface ErrorMessageProps {
  error: string
}

const ErrorMessage: React.FC<ErrorMessageProps> = ({ error }) => {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-3 my-2">
      <div className="flex items-start gap-2">
        <span className="text-red-500 text-sm font-medium">⚠️ Error:</span>
        <div className="flex-1 min-w-0">
          <div 
            className={`text-red-700 text-xs leading-relaxed ${
              !isExpanded ? 'max-h-[120px] overflow-hidden' : ''
            }`}
            style={{ 
              wordBreak: 'break-word',
              whiteSpace: 'pre-wrap'
            }}
          >
            {error}
          </div>
          {error.length > 200 && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-red-600 hover:text-red-800 text-xs mt-1 underline focus:outline-none"
            >
              {isExpanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default ErrorMessage
