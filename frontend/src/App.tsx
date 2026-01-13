import { useState, useEffect } from 'react'
import './App.css'

function App() {
  const [backendStatus, setBackendStatus] = useState<string>('checking...')

  useEffect(() => {
    // Test backend connection
    fetch('/api/auth/health')
      .then(res => res.json())
      .then(data => setBackendStatus(`✅ Connected: ${data.service}`))
      .catch(() => setBackendStatus('❌ Not connected'))
  }, [])

  return (
    <div className="App">
      <h1>🎮 ft_transcendence</h1>
      <p>Welcome to the game platform</p>
      <p className="status">Backend: {backendStatus}</p>
      <div className="actions">
        <button onClick={() => window.location.href = '/api/auth/swagger'}>
          View API Docs
        </button>
      </div>
    </div>
  )
}

export default App