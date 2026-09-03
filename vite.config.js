import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { fileURLToPath } from 'node:url'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), '')
  const buildSingle = environment.BUILD_SINGLE === 'true'
  const publicSafeBuild = environment.PUBLIC_SAFE_BUILD === 'true'
  const demoBuild = environment.DEMO_BUILD === 'true'
  const prattApiKey = String(environment.PRATT_LLM_API_KEY || '').trim()
  const sourcePath = relative => fileURLToPath(new URL(relative, import.meta.url))
  const aliases = {
    '@underscores/physics-worker-factory': sourcePath(buildSingle ? './src/physicsWorkerFactory.inline.js' : './src/physicsWorkerFactory.js'),
  }
  if (publicSafeBuild) {
    // These are deliberately source-specifier aliases: Vite resolves the
    // relative imports before an absolute-file alias is consulted.
    aliases['./strudelRuntime.js'] = sourcePath('./src/publicSafeStrudelRuntime.js')
    aliases['./strudelCodeMirror.js'] = sourcePath('./src/publicSafeStrudelCodeMirror.js')
    aliases['./testFonts.css'] = sourcePath('./src/publicSafeEmpty.css')
  }
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

  // The Strudel package keeps its final mix bus private. Expose a narrowly
  // scoped accessor in the browser bundle so Canvas capture can mirror that
  // bus into a MediaStreamAudioDestinationNode on demand. The transform is
  // build-time only and leaves the dependency untouched on disk.
  const strudelAudioCapturePlugin = {
    name: 'underscores-strudel-audio-capture',
    enforce: 'pre',
    transform(code, id) {
      const sourceId = id.split('?')[0].replaceAll('\\', '/');
      if (code.includes('__underscoresGetSuperdoughAudioController')) return null;
      if (sourceId.endsWith('/superdough/superdough.mjs')) {
        return {
          code: `${code}\nexport { getSuperdoughAudioController as __underscoresGetSuperdoughAudioController };`,
          map: null,
        };
      }
      if (sourceId.endsWith('/superdough/dist/index.mjs')) {
        return {
          code: `${code}\nexport { Je as __underscoresGetSuperdoughAudioController };`,
          map: null,
        };
      }
      return null;
    },
  }

  return {
    base: buildSingle ? '/underscores/' : '/',
    plugins: [
      react(),
      strudelAudioCapturePlugin,
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
      alias: aliases,
    },
    // The internal synth is lazy-loaded on first use. Pre-bundle both CommonJS
    // packages at dev-server startup so a first click cannot race Vite's
    // dependency discovery or retain an outdated optimizer URL after install.
    optimizeDeps: {
      include: ['jzz', 'jzz-synth-tiny'],
      // Keep these modules in Vite's source graph so the capture accessor
      // transform above is applied in dev as well as production builds.
      exclude: ['superdough', '@strudel/webaudio']
    },
    define: {
      "process.env.IS_PREACT": JSON.stringify("false"),
      "process.env.NODE_ENV": JSON.stringify("development"),
      "process.env": {},
      "import.meta.env.VITE_PRATT_LLM_API_KEY_AVAILABLE": JSON.stringify(Boolean(prattApiKey)),
      "import.meta.env.VITE_PUBLIC_SAFE_BUILD": JSON.stringify(publicSafeBuild),
      "import.meta.env.VITE_DEMO_BUILD": JSON.stringify(demoBuild),
    }
  }
})
