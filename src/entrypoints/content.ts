import { defineProxy } from 'comctx'

import { defineContentScript, injectScript } from '#imports'

import './boss/inject.css'
import type { BackgroundCounter } from '@/message/background'
import { InjectBackgroundAdapter } from '@/message/background'
import { ContentCounter } from '@/message/contentScript'
import { ProvideContentScriptAdapter } from '@/message/contentScriptShare'

export default defineContentScript({
  matches: ['*://zhipin.com/*', '*://*.zhipin.com/*'],
  runAt: 'document_start',
  world: 'ISOLATED',
  async main() {
    const [, injectBackgroundCounter] = defineProxy(() => ({}) as BackgroundCounter, {
      namespace: '__boss-helper-background__',
    })

    const [provideContentCounter] = defineProxy(
      () => new ContentCounter(injectBackgroundCounter(new InjectBackgroundAdapter())),
      {
        namespace: '__boss-helper-content__',
        heartbeatTimeout: 3000,
      },
    )

    await injectScript('/boss.js', {
      keepInDom: true,
      modifyScript(script) {
        provideContentCounter(new ProvideContentScriptAdapter(script))
      },
    })
  },
})
