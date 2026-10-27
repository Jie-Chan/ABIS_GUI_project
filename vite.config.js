import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const proxy = env.ABIS_PROXY_TARGET
    ? { '/admin-api': { target: env.ABIS_PROXY_TARGET, changeOrigin: true } }
    : undefined

  return {
    plugins: [vue()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: { port: 5187, strictPort: true, proxy },
    preview: { proxy },
  }
})
