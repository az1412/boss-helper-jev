import { computed, reactive, readonly, ref, shallowRef } from 'vue'

import deepmerge, { jsonClone } from '../../utils/deepmerge'

const presetKey = 'local:FormDataPrese'
const presetsKey = 'local:FormDataPreses'
const defaultPresets = [{ label: '默认配置', value: 'default' }]

export type DraftResolution = 'discard'

interface SettingsStorage {
  get<T>(key: string, fallback: T): Promise<T>
  set(key: string, value: unknown): Promise<unknown>
}

/** 存储是唯一边界；草稿、保存稿和本轮快照必须是三份互不引用的数据。 */
export function createSettingsState<T extends Record<string, any>>(
  defaults: T,
  storage: SettingsStorage,
  normalize: (value: Partial<T>) => Partial<T> = (value) => value,
) {
  const formData = reactive(jsonClone(defaults)) as T
  const saved = shallowRef(jsonClone(defaults))
  const runSnapshot = shallowRef<T | null>(null)
  const isLoading = ref(true)
  const isSaving = ref(false)
  const saveError = ref<string | null>(null)
  const runLocked = ref(false)
  const formDataPreset = ref('default')
  const formDataPresets = ref(jsonClone(defaultPresets))
  const isDirty = computed(() => JSON.stringify(formData) !== JSON.stringify(saved.value))
  let initialized = false
  let initializing: Promise<void> | null = null
  let saving: Promise<void> | null = null
  let savingField: keyof T | null = null

  function formDataKey(preset = formDataPreset.value) {
    return preset === 'default'
      ? 'local:web-geek-job-FormData'
      : `local:web-geek-job-FormData-${preset}`
  }

  function replaceDraft(data: T) {
    for (const key of Object.keys(formData)) {
      if (!(key in data)) delete formData[key]
    }
    Object.assign(formData, jsonClone(data))
  }

  async function read(preset: string) {
    const data = normalize(jsonClone(await storage.get<Partial<T>>(formDataKey(preset), {})))
    // deepmerge 自身不会克隆未覆盖的默认数组，必须先克隆两端。
    return deepmerge<T>(jsonClone(defaults), data)
  }

  function init(): Promise<void> {
    if (initialized) return Promise.resolve()
    if (initializing) return initializing
    isLoading.value = true
    initializing = Promise.resolve().then(async () => {
      try {
        const preset = await storage.get(presetKey, 'default')
        const presets = await storage.get(presetsKey, jsonClone(defaultPresets))
        const data = await read(preset)
        formDataPreset.value = preset
        formDataPresets.value = presets
        saved.value = jsonClone(data)
        replaceDraft(data)
        initialized = true
      } finally {
        isLoading.value = false
        initializing = null
      }
    })
    return initializing
  }

  function assertEditable() {
    if (runLocked.value) throw new Error('运行及暂停收尾期间不能修改配置，请等本轮结束。')
    if (!initialized || isSaving.value || isLoading.value)
      throw new Error('配置尚未加载完成或正在保存，请稍后再试。')
  }

  function assertDraftResolved(resolution?: DraftResolution) {
    if (isDirty.value && resolution !== 'discard') {
      throw new Error('还有未保存的更改，请先保存或明确放弃。')
    }
  }

  function save(field: keyof T | null = null, value?: T[keyof T]): Promise<void> {
    if (saving) {
      if (savingField === field) return saving
      return Promise.reject(new Error('另一项配置正在保存，请稍后再试。'))
    }
    try {
      assertEditable()
    } catch (error) {
      return Promise.reject(error)
    }
    // 局部保存从保存稿合成，绝不夹带其他页面未保存的输入。
    const snapshot = field === null ? jsonClone(formData) : jsonClone(saved.value)
    if (field !== null) snapshot[field] = jsonClone(value!)
    const key = formDataKey()
    isSaving.value = true
    saveError.value = null
    savingField = field
    saving = Promise.resolve().then(async () => {
      try {
        await storage.set(key, snapshot)
        saved.value = jsonClone(snapshot)
        if (field !== null) formData[field] = jsonClone(snapshot[field])
      } catch {
        saveError.value = '保存失败，草稿已保留，请重试。'
        // 不传播底层错误文本：浏览器存储异常可能包含整份配置或凭据。
        throw new Error(saveError.value)
      } finally {
        isSaving.value = false
        saving = null
        savingField = null
      }
    })
    return saving
  }

  async function reload(resolution?: DraftResolution) {
    if (!initialized && !runLocked.value) return init()
    assertEditable()
    assertDraftResolved(resolution)
    isLoading.value = true
    try {
      const data = await read(formDataPreset.value)
      saved.value = jsonClone(data)
      replaceDraft(data)
      saveError.value = null
    } finally {
      isLoading.value = false
    }
  }

  async function switchPreset(value: string, resolution?: DraftResolution) {
    assertEditable()
    if (value === formDataPreset.value) return
    assertDraftResolved(resolution)
    if (!formDataPresets.value.some((preset) => preset.value === value)) {
      throw new Error('预设不存在，请重新选择。')
    }
    isLoading.value = true
    try {
      const data = await read(value)
      // 先确认数据可读、指针可写，再应用到界面。失败时仍保留当前草稿。
      await storage.set(presetKey, value)
      formDataPreset.value = value
      saved.value = jsonClone(data)
      replaceDraft(data)
      saveError.value = null
    } finally {
      isLoading.value = false
    }
  }

  async function createPreset(label: string, resolution?: DraftResolution) {
    assertEditable()
    assertDraftResolved(resolution)
    if (!label.trim()) throw new Error('请填写预设名称。')
    isLoading.value = true
    try {
      let value = Date.now().toString()
      while (formDataPresets.value.some((preset) => preset.value === value)) value += '-1'
      const presets = [...jsonClone(formDataPresets.value), { label: label.trim(), value }]
      const data = jsonClone(saved.value)
      await storage.set(formDataKey(value), data)
      await storage.set(presetsKey, presets)
      await storage.set(presetKey, value)
      formDataPresets.value = presets
      formDataPreset.value = value
      replaceDraft(data)
      saveError.value = null
    } finally {
      isLoading.value = false
    }
  }

  async function beginRun() {
    if (runLocked.value) throw new Error('已有一轮正在运行。')
    // 在首次异步读取前就上锁，避免准备期间切换预设或再次开始。
    runLocked.value = true
    try {
      await init()
      if (saving) await saving
      if (isLoading.value) throw new Error('配置正在加载，请稍后再开始。')
      runSnapshot.value = jsonClone(saved.value)
    } catch (error) {
      runLocked.value = false
      throw error
    }
  }

  function endRun() {
    runSnapshot.value = null
    runLocked.value = false
  }

  return {
    formData,
    formDataPreset,
    formDataPresets,
    formDataKey,
    isDirty,
    isSaving,
    saveError,
    isLoading,
    runLocked,
    init,
    save: () => save(),
    reload,
    switchPreset,
    createPreset,
    saveField: <K extends keyof T>(key: K, value: T[K]) => save(key, value),
    assertEditable,
    beginRun,
    endRun,
    getSavedSnapshot: () => jsonClone(saved.value),
    // 非运行时也不把半份 UI 草稿暴露给 HelperContext。
    getRuntimeData: () => readonly(runSnapshot.value ?? saved.value) as T,
  }
}
