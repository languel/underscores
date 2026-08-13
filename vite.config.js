import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { fileURLToPath } from 'node:url'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), '')
  const buildSingle = environment.BUILD_SINGLE === 'true'
  const prattApiKey = String(environment.PRATT_LLM_API_KEY || '').trim()
  const aiProxy = {
    '/api/nvidia': {
      target: 'https://integrate.api.nvidia.com',
      changeOrigin: true,
      secure: true,
      rewrite: path => path.replace(/^\/api\/nvidia/, '')
    },
    '/api/pratt': {
      target: 'https://llm.pratt.edu',
      changeOrigin: true,
      secure: true,
      rewrite: path => path.replace(/^\/api\/pratt/, ''),
      configure: proxy => {
        proxy.on('proxyReq', (proxyRequest, request) => {
          // A student's browser-entered key is forwarded unchanged and wins.
          // The server environment key is a fallback and is never bundled.
          if (!request.headers.authorization && prattApiKey) {
            proxyRequest.setHeader('Authorization', `Bearer ${prattApiKey}`)
          }
        })
      }
    }
  }

  return {
    base: buildSingle ? '/underscores/' : '/',
    plugins: [
      react(),
      buildSingle && viteSingleFile({ removeViteModuleLoader: true })
    ].filter(Boolean),
    server: {
      port: 8089,
      strictPort: true,
      proxy: aiProxy
    },
    preview: {
      proxy: aiProxy
    },
    resolve: {
      alias: {
        '@underscores/physics-worker-factory': fileURLToPath(new URL(buildSingle ? './src/physicsWorkerFactory.inline.js' : './src/physicsWorkerFactory.js', import.meta.url)),
      },
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
      "import.meta.env.VITE_PRATT_LLM_API_KEY_AVAILABLE": JSON.stringify(Boolean(prattApiKey)),
    }
  }
})
