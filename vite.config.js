import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { beszelHostResourcesPlugin, loadBeszelConfig } from './server/beszelHostResources.js'

export default defineConfig(({ command, mode }) => {
  const plugins = [vue()]
  if (command === 'serve' && mode === 'demo') {
    const config = loadBeszelConfig(new URL('./config/beszel.json', import.meta.url))
    plugins.push(beszelHostResourcesPlugin(config, loadEnv(mode, process.cwd(), config.envNames)))
  }
  return {
    plugins,
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      port: 5173,
      fs: {
        deny: ['.env', '.env.*', '*.{crt,pem,key,p12,pfx,cer,der}', '.npmrc', '.yarnrc.yml', '**/.git/**', '**/config/beszel.json'],
      },
    },
  }
})
