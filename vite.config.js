import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

const buildSingle = process.env.BUILD_SINGLE === 'true'

// https://vite.dev/config/
export default defineConfig({
  base: buildSingle ? '/drawerator/' : '/',
  plugins: [
    react(),
    buildSingle && viteSingleFile({ removeViteModuleLoader: true })
  ].filter(Boolean),
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
