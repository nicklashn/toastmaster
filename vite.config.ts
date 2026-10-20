import react from '@vitejs/plugin-react'
import { defineConfig, type ProxyOptions } from 'vite'

// OpenAI's API omits CORS headers on responses for ChatGPT plan tokens, so a
// browser can't call it directly. Locally, the dev server forwards the calls
// (from your own machine straight to OpenAI).
const openaiProxy: ProxyOptions = {
  target: 'https://api.openai.com',
  changeOrigin: true,
  rewrite: (path) => path.replace(/^\/openai/, ''),
  configure: (proxy) => proxy.on('proxyReq', (req) => req.removeHeader('origin')),
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  worker: { format: 'es' },
  // "Sign in with ChatGPT" only allows this loopback callback address, so
  // running locally here lets the login popup report back automatically.
  server: { host: '127.0.0.1', port: 1455, strictPort: true, proxy: { '/openai': openaiProxy } },
  preview: { host: '127.0.0.1', port: 1455, strictPort: true, proxy: { '/openai': openaiProxy } },
})
