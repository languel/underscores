import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 8089,
    strictPort: true
  },
  define: {
    "process.env.IS_PREACT": JSON.stringify("false"),
    "process.env.NODE_ENV": JSON.stringify("development"),
    "process.env": {},
  }
})
