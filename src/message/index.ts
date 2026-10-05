import type { StorageLikeAsync } from '@vueuse/core'
import { defineProxy } from 'comctx'

import type { ContentCounter } from './contentScript'
import { ProvideContentScriptAdapter } from './contentScriptShare'

export const InjectAdapter = ProvideContentScriptAdapter

let _counter: ContentCounter | null = null

export function initCounter(
  script: HTMLScriptElement = document.currentScript as HTMLScriptElement,
) {
  const [, injectCounter] = defineProxy(() => ({}) as ContentCounter, {
    namespace: '__boss-helper-content__',
  })
  _counter = injectCounter(new InjectAdapter(script))
}

export const counter = new Proxy({} as ContentCounter, {
  get(_, key) {
    if (!_counter) {
      throw new Error(
        `Counter has not been initialized. Call initCounter() before using counter.${String(key)}`,
      )
    }

    const value = (_counter as any)[key]

    if (typeof value === 'function') {
      return value.bind(_counter)
    }

    return value
  },

  set(_, key, value) {
    if (!_counter) {
      throw new Error(
        `Counter has not been initialized. Call initCounter() before using counter.${String(key)}`,
      )
    }

    ;(_counter as any)[key] = value
    return true
  },
})

export const ExtStorage: StorageLikeAsync = {
  async getItem(key) {
    // WXT 在 Node 中导入入口读取元信息，此时不会建立页面通信桥。
    if (import.meta.env.SSR || typeof window === 'undefined') return null
    return new Promise((resolve) => {
      const t = setInterval(() => {
        if (_counter) {
          void counter.storageGet(key).then((value) => {
            return resolve(value as never)
          })
          clearInterval(t)
        }
      }, 200)
    })
  },
  async setItem(key, value) {
    if (import.meta.env.SSR || typeof window === 'undefined') return
    await counter.storageSet(key, value)
  },
  async removeItem(key) {
    if (import.meta.env.SSR || typeof window === 'undefined') return
    await counter.storageRm(key)
  },
}
