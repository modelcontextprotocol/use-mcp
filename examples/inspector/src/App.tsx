import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { McpServers } from './components/McpServers.js'
import { OAuthCallback } from './components/OAuthCallback.js'

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/oauth/callback" element={<OAuthCallback />} />
        <Route path="/" element={
          <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
            <div className="w-full max-w-2xl">
              <div className="text-center mb-8">
                <h1 className="text-3xl font-bold text-gray-900 mb-2">MCP Inspector</h1>
                <p className="text-gray-600">
                  Minimal demo showcasing the{' '}
                  <a 
                    href="https://github.com/modelcontextprotocol/use-mcp" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 underline font-medium transition-colors"
                  >
                    use-mcp
                  </a>{' '}
                  React hook
                </p>
              </div>
              <McpServers />
            </div>
          </div>
        } />
      </Routes>
    </Router>
  )
}

export default App
