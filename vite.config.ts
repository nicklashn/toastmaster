import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  worker: { format: 'es' },
  // "Sign in with ChatGPT" only allows this loopback callback address, so
  // running locally here lets the login popup report back automatically.
  server: { host: '127.0.0.1', port: 1455, strictPort: true },
  preview: { host: '127.0.0.1', port: 1455, strictPort: true },
})
