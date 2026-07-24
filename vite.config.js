import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

const buildSingle = process.env.BUILD_SINGLE === 'true'
const nvidiaProxy = {
  '/api/nvidia': {
    target: 'https://integrate.api.nvidia.com',
    changeOrigin: true,
    secure: true,
    rewrite: path => path.replace(/^\/api\/nvidia/, '')
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: buildSingle ? '/drawerator/' : '/',
  plugins: [
    react(),
    buildSingle && viteSingleFile({ removeViteModuleLoader: true })
  ].filter(Boolean),
  server: {
    port: 8089,
    strictPort: true,
    proxy: nvidiaProxy
  },
  preview: {
    proxy: nvidiaProxy
  },
  // The internal synth is lazy-loaded on first use. Pre-bundle both CommonJS
  // packages at dev-server startup so a first click cannot race Vite's
  // dependency discovery or retain an outdated optimizer URL after install.
  optimizeDeps: {
    include: ['jzz', 'jzz-synth-tiny']
  },
  define: {
    "process.env.IS_PREACT": JSON.stringify("false"),
    "process.env.NODE_ENV": JSON.stringify("development"),
    "process.env": {},
  }
})
