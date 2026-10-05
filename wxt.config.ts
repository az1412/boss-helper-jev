import { resolve } from 'path'

import ui from '@nuxt/ui/vite'
import vueJsx from '@vitejs/plugin-vue-jsx'
import tailwindShadowDOM from 'vite-plugin-tailwind-shadowdom'
import { defineConfig } from 'wxt'

import { version } from './package.json'

const matches = ['*://zhipin.com/*', '*://*.zhipin.com/*']

// pdfjs 的 worker 不走 vite 打包（它是独立的 ES module，要用独立 URL 起 Worker），
// 构建时直接从 node_modules 拷到输出目录根部；主世界通过 counter.getResourceUrl 取它的 URL
const PDF_WORKER_FILE = 'pdf.worker.min.mjs'
const PDF_WORKER_SRC = resolve(__dirname, 'node_modules/pdfjs-dist/build', PDF_WORKER_FILE)

export default defineConfig({
  srcDir: 'src',
  outDirTemplate: '{{browser}}-mv{{manifestVersion}}',
  modules: ['@wxt-dev/module-vue'],
  // imports: false,

  vite: () => ({
    resolve: {
      alias: {
        'devlog-ui': resolve(__dirname, 'packages/devlog-ui/src'),
      },
    },
    define: {
      __APP_VERSION__: JSON.stringify(version),
    },
    ssr: {
      noExternal: [
        '@webext-core/storage',
        '@webext-core/messaging',
        '@webext-core/proxy-service',
        '@nuxt/ui',
        '@nuxt/icon',
      ],
    },
    plugins: [
      vueJsx(),
      ui({
        // autoImport: false,
        // components: false,
        colorMode: false,
        router: false,
        prose: false,
        ui: {
          colors: {
            primary: 'teal',
            neutral: 'gray',
            warning: 'orange',
            success: 'emerald',
            error: 'rose',
          },
          badge: {
            defaultVariants: {
              color: 'neutral',
              variant: 'subtle',
            },
          },
          alert: {
            slots: {
              root: 'px-4 py-2',
            },
            defaultVariants: {
              orientation: 'horizontal',
            },
          },
          button: {
            slots: {
              base: 'cursor-pointer',
            },
          },
          tabs: {
            slots: {
              trigger: 'cursor-pointer',
            },
          },
          link: {
            base: 'no-underline hover:underline',
          },
          formField: {
            slots: {
              // container: 'flex flex-1',
              // root: 'justify-start items-center',
            },
            defaultVariants: {
              orientation: 'horizontal',
            },
          },
          modal: {
            slots: {
              overlay: 'z-200',
              content: 'z-220',
              footer: 'justify-end',
            },
          },
          chatMessage: {
            variants: {
              side: {
                right: {
                  container: 'flex-row-reverse justify-start',
                },
              },
            },
          },
          slideover: {
            slots: {
              content: 'z-230',
            },
          },
        },
      }),
      tailwindShadowDOM(),
    ],
  }),
  dev: {},
  manifest: ({ browser }) => ({
    default_locale: 'zh_CN',
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    permissions: ['storage', 'notifications'],
    web_accessible_resources: [
      {
        // pdf.worker.min.mjs：pdfjs 的解析 worker。简历 PDF 在主世界（zhipin 来源）里解析，
        // pdfjs 6 没有 worker 就跑不起来，所以这个文件必须能被页面按扩展 URL 加载到
        resources: ['boss.js', PDF_WORKER_FILE],
        matches,
      },
    ],
    host_permissions: ['http://*/*', 'https://*/*'],
    key:
      browser === 'edge'
        ? undefined // 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAq+hJAUmfZSTB6c7QOXiU6r1JUMLM3C/CDTVolB5pU/DAkO3Y3uVh/YWWaV8m2wIrLSjN7n1CZ+zmRlO+YpUq2vZRILq8WXFePCfHe8EqVY9mjj04BqqRuttHpJqMeXl1aVbKmICKj3cNEprGzJJvaAorz0NJxD82oLXf8CMIW0MHUjvwgmNc9HTD41glvX6CzW1r4qvwl4MSdZRPVf5dmhp+CWoaAcjqEpHbu+EZV5WpfQz9XCsmBXmMAFLyBtn62Xvy86c9PntIRw8xMikqmi8lVyOgT8oSM2U8EFyMsESoT2qCQXgUf0FMtKipoNs7xM7FtdOppNylHa6jJyYdRwIDAQAB'
        : browser === 'chrome'
          ? undefined // Jev 开发版：去掉固定 key，扩展 ID 改由目录路径决定，与封存版不同，两个可并存、互不覆盖
          : undefined,
    browser_specific_settings:
      browser == 'firefox'
        ? {
            gecko: {
              id: '{1b66669d-c871-43f3-8c0c-d8a1c0566071}',
              strict_min_version: '109.0',
            },
          }
        : undefined,
  }),
  webExt: {
    disabled: true,
  },
  hooks: {
    'build:publicAssets': (_wxt, files) => {
      files.push({ absoluteSrc: PDF_WORKER_SRC, relativeDest: PDF_WORKER_FILE })
      // 安装包也携带许可与本版说明，不仅在源码目录保留。
      for (const [source, destination] of [
        ['LICENSE', 'LICENSE'],
        ['THIRD_PARTY_NOTICES.md', 'THIRD_PARTY_NOTICES.md'],
        ['PRIVACY.md', 'PRIVACY.md'],
        ['packages/devlog-ui/LICENSE', 'licenses/devlog-ui-LICENSE.txt'],
      ]) {
        files.push({ absoluteSrc: resolve(__dirname, source), relativeDest: destination })
      }
    },
  },
})
