import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// ChatGPT login popup landing on the local callback address: hand the result
// to the page that opened it and close.
const isCallback = location.pathname === '/auth/callback'
if (isCallback && window.opener) {
  window.opener.postMessage({ type: 'chatgpt-callback', url: location.href }, location.origin)
  window.close()
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>{isCallback ? <p style={{ padding: 16 }}>Login modtaget. Du kan lukke dette vindue.</p> : <App />}</StrictMode>,
)
