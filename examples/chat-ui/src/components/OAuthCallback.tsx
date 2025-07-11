import React, { useEffect, useState, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { completeOAuthFlow } from '../utils/auth'
import { SupportedProvider } from '../types/models'

interface OAuthCallbackProps {
  provider: SupportedProvider
}

const OAuthCallback: React.FC<OAuthCallbackProps> = ({ provider }) => {
  const [searchParams] = useSearchParams()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const executedRef = useRef(false)

  useEffect(() => {
    const handleCallback = async () => {
      if (executedRef.current) {
        console.log('DEBUG: Skipping duplicate OAuth callback execution')
        return
      }
      executedRef.current = true

      try {
        const code = searchParams.get('code')
        const state = searchParams.get('state')
        const error = searchParams.get('error')

        if (error) {
          throw new Error(`OAuth error: ${error}`)
        }

        if (!code) {
          throw new Error('Missing authorization code')
        }

        // TODO: Add state parameter handling back if needed later
        // const stateToUse = state || 'no-state'
        await completeOAuthFlow(provider, code)
        setStatus('success')

        // Close popup after successful authentication
        // Give extra time for debugging in development
        setTimeout(() => {
          if (window.opener) {
            window.opener.postMessage({ type: 'oauth_success', provider }, '*')
            window.close()
          } else {
            // Redirect to main page if not in popup
            window.location.href = '/'
          }
        }, 3000)
      } catch (err) {
        console.error('OAuth callback error:', err)
        setError(err instanceof Error ? err.message : 'Unknown error')
        setStatus('error')
      }
    }

    handleCallback()
  }, [searchParams, provider])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-8">
        <div className="text-center">
          {status === 'loading' && (
            <>
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Completing Authentication</h2>
              <p className="text-gray-600">Connecting to {provider}...</p>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="text-green-500 mb-4">
                <svg className="w-12 h-12 mx-auto" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Authentication Successful!</h2>
              <p className="text-gray-600 mb-4">Successfully connected to {provider}. You can now close this window.</p>
              <button
                onClick={() => window.close()}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
              >
                Close Window
              </button>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="text-red-500 mb-4">
                <svg className="w-12 h-12 mx-auto" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Authentication Failed</h2>
              <p className="text-gray-600 mb-4">{error || 'An error occurred during authentication'}</p>
              <button
                onClick={() => window.close()}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
              >
                Close Window
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default OAuthCallback
