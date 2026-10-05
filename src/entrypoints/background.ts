import { defineProxy } from 'comctx'

import { defineBackground } from '#imports'
import { BackgroundCounter, ProvideBackgroundAdapter } from '@/message/background'

export default defineBackground({
  main() {
    const [provideBackgroundCounter] = defineProxy(() => new BackgroundCounter(), {
      namespace: '__boss-helper-background__',
    })

    provideBackgroundCounter(new ProvideBackgroundAdapter())
  },
})
