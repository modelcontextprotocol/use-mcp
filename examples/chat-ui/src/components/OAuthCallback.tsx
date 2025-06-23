import { useEffect } from 'react'
import { onMcpAuthorization } from 'use-mcp'

export function OAuthCallback() {
  useEffect(() => {
    onMcpAuthorization()
  }, [])

  return (
    <div className="min-h-screen animated-bg-container flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 text-center max-w-md w-full">
        <h1 className="text-2xl font-bold text-zinc-900 mb-4">Authenticating...</h1>
        <p className="text-zinc-600 mb-2">Please wait while we complete your authentication.</p>
        <p className="text-sm text-zinc-500">This window should close automatically.</p>
        
        <div className="mt-6">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        </div>
      </div>
    </div>
  )
}
