import type { StorageItemKey } from '#imports'
import { browser, storage } from '#imports'

import type { BackgroundCounter } from './background'
export { ProvideContentAdapter } from './contentScriptShare'

function genKey(key: string): StorageItemKey {
  const prefixes = ['local:', 'session:', 'sync:', 'managed:'] as const
  return prefixes.some((prefix) => key.startsWith(prefix)) ? (key as StorageItemKey) : `sync:${key}`
}

export class ContentCounter implements BackgroundCounter {
  public background: BackgroundCounter
  public routerHooks: Array<(path: string) => void> = []

  constructor(background: BackgroundCounter) {
    this.background = background
  }

  _addRouterHook(hook: (path: string) => void) {
    this.routerHooks.push(hook)
  }

  async callRouterHooks(path: string) {
    for (const hook of this.routerHooks) {
      try {
        hook(path)
      } catch (e) {
        console.error('调用路由hook失败', e)
      }
    }
  }

  async request(...args: Parameters<BackgroundCounter['request']>) {
    return this.background.request(...args)
  }

  async notify(...args: Parameters<BackgroundCounter['notify']>) {
    return this.background.notify(...args)
  }

  async backgroundTest(...args: Parameters<BackgroundCounter['backgroundTest']>) {
    return this.background.backgroundTest(...args)
  }

  async fetch(...args: Parameters<typeof fetch>) {
    return this.background.fetch(...args)
  }

  async aiFetch(...args: Parameters<BackgroundCounter['aiFetch']>) {
    return this.background.aiFetch(...args)
  }

  async getImage(...args: Parameters<BackgroundCounter['getImage']>) {
    return this.background.getImage(...args)
  }
  async setImage(...args: Parameters<BackgroundCounter['setImage']>) {
    return this.background.setImage(...args)
  }

  async storageGet<T>(key: string, defaultValue: T): Promise<T>
  async storageGet<T>(key: string): Promise<T | null>
  async storageGet<T>(key: string, defaultValue?: T): Promise<T | null> {
    return storage.getItem<T>(genKey(key), { fallback: defaultValue })
  }

  async storageSet<T>(key: string, value: T) {
    await storage.setItem(genKey(key), value)
    return true
  }

  async storageRm(key: string) {
    await storage.removeItem(genKey(key))
    return true
  }

  /**
   * 扩展内静态资源的绝对 URL（chrome-extension://<id>/...）。
   *
   * 主世界脚本（boss.js）跑在 zhipin 来源里，拿不到 `browser.runtime`，而 pdfjs 的
   * worker 必须用扩展 URL 才能起。文件还得列在 manifest 的 web_accessible_resources
   * 里，否则页面按这个 URL 也加载不到。
   */
  async getResourceUrl(path: string) {
    return browser.runtime.getURL(path as never)
  }

  async contentScriptTest(type: 'success' | 'error') {
    if (type === 'error') {
      throw new Error(`test error date: ${Date.now()}`)
    }
    return Date.now()
  }
}
