import { defaultFormData } from '../src/composables/conf/info'

const store = new Map<string, unknown>()
const initial = structuredClone(defaultFormData)
initial.configLevel = 'intermediate'
initial.profile = {
  targetJob: '机械研发 / 数据分析',
  resume: '离线演示资料，不是真实简历',
  want: '双休',
  avoid: '',
  strictness: 'normal',
  onboarded: true,
}
initial.jev = { ...initial.jev, enable: true, apiKey: 'DEMO_NOT_A_REAL_KEY', mode: 'fast' }
initial.deliveryLimit.value = 20
initial.delayDeliveryStarts = 0.5
initial.delayDeliveryInterval = 1
initial.delayDeliveryPageNext = 2
store.set('local:web-geek-job-FormData', initial)
export const fault = { failNextSave: false }
export const counter = {
  async storageGet<T>(key: string, fallback?: T): Promise<T> {
    return structuredClone((store.has(key) ? store.get(key) : fallback) as T)
  },
  async storageSet(key: string, value: unknown) {
    await new Promise((resolve) => setTimeout(resolve, 100))
    if (fault.failNextSave) {
      fault.failNextSave = false
      throw new Error('离线模拟：存储暂时不可用，输入已保留')
    }
    store.set(key, structuredClone(value))
  },
  async storageRm(key: string) {
    store.delete(key)
  },
  async notify() {},
  async aiFetch() {
    throw new Error('离线预览禁止真实 AI 请求')
  },
  async getResourceUrl() {
    return ''
  },
  async getImage() {
    return { success: false }
  },
}
export const ExtStorage = {
  getItem: (key: string) => counter.storageGet(key, null),
  setItem: (key: string, value: unknown) => counter.storageSet(key, value),
  removeItem: (key: string) => counter.storageRm(key),
}
export const InjectAdapter = class {}
export const initCounter = () => {}
