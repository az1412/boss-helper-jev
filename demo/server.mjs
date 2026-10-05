import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import ui from '@nuxt/ui/vite'
import vueJsx from '@vitejs/plugin-vue-jsx'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
process.chdir(root)
const require = createRequire(import.meta.url)
const wxtRequire = createRequire(require.resolve('wxt'))
const vueRequire = createRequire(require.resolve('@wxt-dev/module-vue'))
const { createServer } = await import(pathToFileURL(wxtRequire.resolve('vite')).href)
const { default: vue } = await import(pathToFileURL(vueRequire.resolve('@vitejs/plugin-vue')).href)
const server = await createServer({
  configFile: false,
  root: resolve(root, 'demo'),
  server: {
    host: '127.0.0.1',
    port: Number(process.env.PORT || 5174),
    strictPort: true,
    fs: { allow: [root] },
  },
  resolve: {
    alias: [
      { find: '@/message', replacement: resolve(root, 'demo/message.ts') },
      { find: '@/composables/useModel/typesafe', replacement: resolve(root, 'demo/typesafe.ts') },
      { find: '@', replacement: resolve(root, 'src') },
      { find: '~', replacement: resolve(root, 'src') },
      { find: 'devlog-ui', replacement: resolve(root, 'packages/devlog-ui/src') },
    ],
  },
  define: { __APP_VERSION__: JSON.stringify('0.5.2.2 · 离线预览') },
  plugins: [
    {
      name: 'preview-wxt-imports',
      enforce: 'pre',
      resolveId(id, importer) {
        if (
          id === '#imports' &&
          importer?.replaceAll('\\', '/').startsWith(root.replaceAll('\\', '/') + '/src/')
        )
          return resolve(root, 'demo/imports.ts')
      },
    },
    vue(),
    vueJsx(),
    ui({
      router: false,
      colorMode: false,
      dts: false,
      autoImport: { imports: ['vue'], dirs: [resolve(root, 'src/utils')], dts: false },
      components: { dirs: [resolve(root, 'src/components')], dts: false },
      ui: {
        colors: {
          primary: 'teal',
          neutral: 'gray',
          warning: 'orange',
          success: 'emerald',
          error: 'rose',
        },
        formField: { defaultVariants: { orientation: 'horizontal' } },
      },
    }),
  ],
})
await server.listen()
server.printUrls()
