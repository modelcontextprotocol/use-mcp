import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import ChatApp from './components/ChatApp'
import OAuthCallback from './components/OAuthCallback'

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/oauth/openrouter/callback" element={<OAuthCallback provider="openrouter" />} />
        <Route path="/oauth/callback" element={<OAuthCallback provider="openrouter" />} />
        <Route path="/" element={<ChatApp />} />
      </Routes>
    </Router>
  )
}

export default App
