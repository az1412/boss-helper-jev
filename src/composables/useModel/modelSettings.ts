import { computed, readonly, ref } from 'vue'

import { jsonClone } from '../../utils/deepmerge'
import type { ModelConf } from './index'
import { normalizeModelConfig } from './openai'

export function validateModels(input: unknown, allowEmptyKey = false): ModelConf[] {
  if (!Array.isArray(input)) throw new Error('模型配置必须是数组')
  const keys = new Set<string>()
  return input.map((item) => {
    if (!item || typeof item.key !== 'string' || !item.key || keys.has(item.key))
      throw new Error('模型标识缺失或重复')
    keys.add(item.key)
    if (typeof item.name !== 'string' || !item.name.trim()) throw new Error('请填写模型名称')
    return {
      key: item.key,
      name: item.name.trim(),
      color: item.color,
      data: normalizeModelConfig(item.data, allowEmptyKey),
    }
  })
}

export function createModelSettings(storage: {
  get(): Promise<ModelConf[]>
  set(models: ModelConf[]): Promise<unknown>
}) {
  const saved = ref<ModelConf[]>([])
  const loading = ref(false)
  const saving = ref(false)
  const editing = ref(false)
  const testing = ref(0)
  const error = ref('')
  let initialized = false
  let pending: Promise<void> | undefined
  async function init(force = false) {
    if (pending) return pending
    if (initialized && !force) return
    loading.value = true
    pending = Promise.resolve().then(async () => {
      try {
        const data = await storage.get()
        if (!Array.isArray(data)) throw new Error()
        saved.value = jsonClone(data)
        initialized = true
        error.value = ''
      } catch {
        error.value = '模型配置加载失败，请重试'
        throw new Error(error.value)
      } finally {
        loading.value = false
        pending = undefined
      }
    })
    return pending
  }
  async function save(input: unknown) {
    if (saving.value || loading.value) throw new Error('模型配置正在读写，请稍后重试')
    const snapshot = validateModels(input)
    saving.value = true
    try {
      await storage.set(jsonClone(snapshot))
      saved.value = snapshot
      initialized = true
      error.value = ''
    } catch {
      error.value = '模型配置保存失败，草稿已保留'
      throw new Error(error.value)
    } finally {
      saving.value = false
    }
  }
  return {
    modelData: computed(() => readonly(saved.value)),
    loading,
    saving,
    editing,
    testing,
    error,
    initModel: init,
    saveModel: save,
    snapshot: () => jsonClone(saved.value),
  }
}
