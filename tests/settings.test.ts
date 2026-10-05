import { describe, expect, test } from 'bun:test'

import { defaultFormData } from '../src/composables/conf/info'
import { createSettingsState } from '../src/composables/conf/settingsState'

const key = 'local:web-geek-job-FormData'
test('旧配置补齐快速模式与本轮50，保留原每日设置且不写回迁移', async () => {
  let writes = 0
  const state = createSettingsState(defaultFormData, {
    async get<T>(name: string, fallback: T): Promise<T> {
      return (
        name === key
          ? { jev: { rank: true, enable: true }, deliveryLimit: { value: 80 } }
          : fallback
      ) as T
    },
    async set() {
      writes++
    },
  })
  await state.init()
  expect(state.formData.jev.mode).toBe('fast')
  expect(state.formData.runDeliveryLimit).toBe(50)
  expect(state.formData.deliveryLimit.value).toBe(80)
  expect(writes).toBe(0)
})
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))
const defaults = () => ({
  profile: { targetJob: '', resume: '', want: '', strictness: 'normal', onboarded: false },
  jev: { enable: false, apiKey: '', model: 'jev-latest', rank: true },
  limit: 30,
  options: ['one'],
})

function fixture() {
  const initial = defaults()
  initial.profile.targetJob = '已保存岗位'
  const data = new Map<string, unknown>([
    [key, initial],
    [
      'local:FormDataPreses',
      [
        { label: '默认配置', value: 'default' },
        { label: '另一份', value: 'other' },
      ],
    ],
    [key + '-other', { ...defaults(), limit: 80 }],
  ])
  let reads = 0
  let writes = 0
  let failRead = false
  let failWrite = false
  let waitWrite: Promise<void> | undefined
  const state = createSettingsState(defaults(), {
    async get<T>(key: string, fallback: T): Promise<T> {
      reads++
      if (failRead) throw new Error('TEST_STORAGE_FAILURE')
      return clone((data.has(key) ? data.get(key) : fallback) as T)
    },
    async set(key: string, value: unknown) {
      writes++
      await waitWrite
      if (failWrite) throw new Error('TEST_PRIVATE_VALUE_MUST_NOT_BE_REPORTED')
      data.set(key, clone(value))
    },
  })
  return {
    state,
    data,
    get reads() {
      return reads
    },
    get writes() {
      return writes
    },
    failRead: (value: boolean) => {
      failRead = value
    },
    failWrite: (value: boolean) => {
      failWrite = value
    },
    delayWrite: (value: Promise<void>) => {
      waitWrite = value
    },
  }
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('设置草稿与保存稿', () => {
  test('默认对象与嵌套数组不会被输入或初始化污染', async () => {
    const original = defaults()
    const state = createSettingsState(original, {
      get: async (_key, fallback) => fallback,
      set: async () => {},
    })
    await state.init()
    state.formData.profile.targetJob = '测试修改'
    state.formData.options.push('two')
    expect(original).toEqual(defaults())
    expect(state.getSavedSnapshot()).toEqual(defaults())
  })

  test('首次初始化并发单飞，后续 init 不覆盖草稿', async () => {
    const f = fixture()
    await Promise.all([f.state.init(), f.state.init(), f.state.init()])
    expect(f.reads).toBe(3)
    f.state.formData.limit = 99
    await f.state.init()
    expect(f.reads).toBe(3)
    expect(f.state.formData.limit).toBe(99)
    expect(f.state.isDirty.value).toBe(true)
  })

  test('初始化失败可重试，不允许把默认值误存为用户配置', async () => {
    const f = fixture()
    f.failRead(true)
    await expect(f.state.init()).rejects.toThrow()
    expect(f.state.isLoading.value).toBe(false)
    await expect(f.state.save()).rejects.toThrow()
    expect(f.writes).toBe(0)
    f.failRead(false)
    await f.state.reload()
    expect(f.state.formData.profile.targetJob).toBe('已保存岗位')
  })

  test('弹窗独立草稿取消后不改变全局配置，也不写存储', async () => {
    const f = fixture()
    await f.state.init()
    const draft = clone(f.state.getSavedSnapshot().profile)
    draft.targetJob = '弹窗里改了但取消'
    expect(f.state.formData.profile.targetJob).toBe('已保存岗位')
    expect(f.state.isDirty.value).toBe(false)
    expect(f.writes).toBe(0)
  })

  test('局部保存只存求职意向，成功前不应用，其他未保存输入原样保留', async () => {
    const f = fixture()
    await f.state.init()
    const gate = deferred()
    f.delayWrite(gate.promise)
    f.state.formData.limit = 99
    f.state.formData.jev.enable = true
    const draft = { ...clone(f.state.formData.profile), targetJob: '新求职意向', onboarded: true }
    const saving = f.state.saveField('profile', draft)
    expect(f.state.formData.profile.targetJob).toBe('已保存岗位')
    expect(f.state.isSaving.value).toBe(true)
    gate.resolve()
    await saving
    expect(f.state.formData.profile.targetJob).toBe('新求职意向')
    expect(f.state.getSavedSnapshot().limit).toBe(30)
    expect(f.state.getSavedSnapshot().jev.enable).toBe(false)
    expect(f.state.formData.limit).toBe(99)
    expect(f.state.formData.jev.enable).toBe(true)
    expect(f.state.isDirty.value).toBe(true)
    expect(f.data.get(key)).toEqual(f.state.getSavedSnapshot())
  })

  test('求职意向保存失败保留独立草稿与全局旧值', async () => {
    const f = fixture()
    await f.state.init()
    f.failWrite(true)
    const draft = { ...clone(f.state.formData.profile), targetJob: '失败后可重试' }
    await expect(f.state.saveField('profile', draft)).rejects.toThrow('草稿已保留')
    expect(draft.targetJob).toBe('失败后可重试')
    expect(f.state.formData.profile.targetJob).toBe('已保存岗位')
    expect(f.state.saveError.value).not.toContain('TEST_PRIVATE_VALUE')
    expect(f.state.isSaving.value).toBe(false)
    f.failWrite(false)
    await f.state.saveField('profile', draft)
    expect(f.state.formData.profile.targetJob).toBe('失败后可重试')
    expect(f.state.saveError.value).toBeNull()
  })

  test('保存防重入，提交后继续编辑不会被误标为已保存', async () => {
    const f = fixture()
    await f.state.init()
    const gate = deferred()
    f.delayWrite(gate.promise)
    f.state.formData.limit = 40
    const first = f.state.save()
    expect(f.state.save()).toBe(first)
    await expect(f.state.saveField('profile', f.state.formData.profile)).rejects.toThrow('正在保存')
    f.state.formData.limit = 50
    gate.resolve()
    await first
    expect(f.writes).toBe(1)
    expect(f.state.getSavedSnapshot().limit).toBe(40)
    expect(f.state.formData.limit).toBe(50)
    expect(f.state.isDirty.value).toBe(true)
    await f.state.save()
    expect(f.state.isDirty.value).toBe(false)
  })

  test('保存失败既不改变保存稿也不清草稿，可重试', async () => {
    const f = fixture()
    await f.state.init()
    f.state.formData.limit = 99
    f.failWrite(true)
    await expect(f.state.save()).rejects.toThrow('保存失败')
    expect(f.state.formData.limit).toBe(99)
    expect(f.state.getSavedSnapshot().limit).toBe(30)
    expect(f.state.isDirty.value).toBe(true)
    expect(f.state.isSaving.value).toBe(false)
    f.failWrite(false)
    await f.state.save()
    expect(f.state.isDirty.value).toBe(false)
  })

  test('同步抛出的存储错误也能释放保存锁', async () => {
    let fail = true
    const state = createSettingsState(defaults(), {
      get: async (_key, fallback) => fallback,
      set: () => {
        if (fail) throw new Error('test')
        return Promise.resolve()
      },
    })
    await state.init()
    await expect(state.save()).rejects.toThrow('保存失败')
    fail = false
    await state.save()
    expect(state.isSaving.value).toBe(false)
  })
})

describe('预设与重载保护', () => {
  test('未明确处理草稿时不能切换、重载或创建预设', async () => {
    const f = fixture()
    await f.state.init()
    f.state.formData.limit = 99
    await expect(f.state.switchPreset('other')).rejects.toThrow('未保存')
    await expect(f.state.reload()).rejects.toThrow('未保存')
    await expect(f.state.createPreset('新预设')).rejects.toThrow('未保存')
    expect(f.state.formDataPreset.value).toBe('default')
    expect(f.state.formData.limit).toBe(99)
    expect(f.writes).toBe(0)
  })

  test('明确放弃后重载完整替换而不是合并残留字段', async () => {
    const f = fixture()
    await f.state.init()
    f.state.formData.limit = 99
    ;(f.state.formData as any).temporary = '不得残留'
    await f.state.reload('discard')
    expect(f.state.formData.limit).toBe(30)
    expect('temporary' in f.state.formData).toBe(false)
    expect(f.state.isDirty.value).toBe(false)
  })

  test('先保存后切换，修改写到旧预设；新预设值不受污染', async () => {
    const f = fixture()
    await f.state.init()
    f.state.formData.limit = 99
    await f.state.save()
    await f.state.switchPreset('other')
    expect((f.data.get(key) as any).limit).toBe(99)
    expect(f.state.formData.limit).toBe(80)
    expect(f.state.formDataPreset.value).toBe('other')
    expect(f.state.isDirty.value).toBe(false)
  })

  test('切换存储失败仍保留原预设和未保存草稿', async () => {
    const f = fixture()
    await f.state.init()
    f.state.formData.limit = 99
    f.failWrite(true)
    await expect(f.state.switchPreset('other', 'discard')).rejects.toThrow()
    expect(f.state.formDataPreset.value).toBe('default')
    expect(f.state.formData.limit).toBe(99)
    expect(f.state.isLoading.value).toBe(false)
  })

  test('新建失败不先改变预设指针；成功的新预设是独立副本', async () => {
    const f = fixture()
    await f.state.init()
    f.failWrite(true)
    await expect(f.state.createPreset('test')).rejects.toThrow()
    expect(f.state.formDataPreset.value).toBe('default')
    f.failWrite(false)
    await f.state.createPreset('test')
    expect(f.state.formDataPreset.value).not.toBe('default')
    expect(f.state.isDirty.value).toBe(false)
    f.state.formData.profile.targetJob = '仅新预设'
    expect((f.data.get(key) as any).profile.targetJob).toBe('已保存岗位')
  })
})

describe('运行快照', () => {
  test('使用已保存设置运行，不夹带草稿；UI后续编辑不影响本轮', async () => {
    const f = fixture()
    await f.state.init()
    f.state.formData.limit = 99
    await f.state.beginRun()
    expect(f.state.runLocked.value).toBe(true)
    expect(f.state.getRuntimeData().limit).toBe(30)
    f.state.formData.profile.targetJob = '运行中草稿'
    expect(f.state.getRuntimeData().profile.targetJob).toBe('已保存岗位')
    expect(f.state.formData.limit).toBe(99)
    const copy = f.state.getSavedSnapshot()
    copy.profile.targetJob = '调用者的副本'
    expect(f.state.getRuntimeData().profile.targetJob).toBe('已保存岗位')
    f.state.endRun()
    expect(f.state.runLocked.value).toBe(false)
    await f.state.save()
    await f.state.beginRun()
    expect(f.state.getRuntimeData().limit).toBe(99)
  })

  test('运行、准备与收尾锁禁止重复开始、保存、切换及重载', async () => {
    const f = fixture()
    const running = f.state.beginRun()
    expect(f.state.runLocked.value).toBe(true)
    await expect(f.state.beginRun()).rejects.toThrow('已有一轮')
    await running
    await expect(f.state.save()).rejects.toThrow('运行')
    await expect(f.state.switchPreset('other', 'discard')).rejects.toThrow('运行')
    await expect(f.state.reload('discard')).rejects.toThrow('运行')
    await expect(f.state.createPreset('new')).rejects.toThrow('运行')
    expect(f.writes).toBe(0)
    f.state.endRun()
    await f.state.switchPreset('other')
    expect(f.state.formData.limit).toBe(80)
  })

  test('开始等待已在进行的保存，取成功落盘版本', async () => {
    const f = fixture()
    await f.state.init()
    f.state.formData.limit = 45
    const gate = deferred()
    f.delayWrite(gate.promise)
    const save = f.state.save()
    const run = f.state.beginRun()
    gate.resolve()
    await Promise.all([save, run])
    expect(f.state.getRuntimeData().limit).toBe(45)
  })
})
