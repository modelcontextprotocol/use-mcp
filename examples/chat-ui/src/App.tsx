import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import ChatApp from './components/ChatApp'
import PkceCallback from './components/PkceCallback.tsx'

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/oauth/groq/callback" element={<PkceCallback provider="groq" />} />
        <Route path="/oauth/openrouter/callback" element={<PkceCallback provider="openrouter" />} />
        <Route path="/oauth/callback" element={<PkceCallback provider="openrouter" />} />
        <Route path="/" element={<ChatApp />} />
      </Routes>
    </Router>
  )
}

export default App
