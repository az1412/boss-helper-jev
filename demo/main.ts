import { useToast } from '@nuxt/ui/runtime/composables/useToast.js'
import ui from '@nuxt/ui/vue-plugin'
import * as VueUse from '@vueuse/core'
import * as Vue from 'vue'

import '../src/assets/main.css'

// 真实扩展由 WXT 注入这些全局导入；离线入口显式提供相同 Vue/Toast 能力。
Object.assign(globalThis, Vue, VueUse, { useToast })
const { createDemoHelper } = await import('./helper')
const { HelperKey } = await import('../src/composables/useHelper')
const { default: Demo } = await import('./Demo.vue')
const helper = await createDemoHelper()
const app = Vue.createApp(Demo)
app.use(ui)
app.provide(HelperKey, helper)
app.mount('#app')
Object.assign(window, { __demo: { helper } })
