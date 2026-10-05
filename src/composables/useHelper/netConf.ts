import type { AlertProps } from '@nuxt/ui'
import type { Toast } from '@nuxt/ui/runtime/composables/useToast.js'

export interface NetConf {
  version: string
  version_description?: string
  notification: (NotificationAlert | NotificationNotification)[]
  store?: Record<string, [string, string, string]>
  price_info?: {
    signedKey: number
    account: number
    update_time: string
  }
  feedback: string
}

export interface NotificationAlert {
  key: string
  type: 'alert'
  data: AlertProps
}

export interface NotificationNotification {
  key: string
  type: 'notification'
  data: Partial<Toast> & {
    url?: string
    duration?: number
    [key: string]: any
  }
}

// 保留兼容接口，但本版不读取上游远程公告、商店或反馈配置。
// 每次返回独立空配置，既不展示遗留推广，也不清除用户存储。
export async function initNetConf(): Promise<NetConf> {
  return { version: '', notification: [], feedback: '', store: {} }
}
