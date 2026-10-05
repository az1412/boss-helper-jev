import { reactiveComputed, useStorageAsync } from '@vueuse/core'

import { counter } from '@/message'
import { ExtStorage } from '@/message'
import type { ConfigLevel, FormData } from '@/types/formData'
import deepmerge, { jsonClone } from '@/utils/deepmerge'
import { exportJson, importJson } from '@/utils/jsonImportExport'
import { logger } from '@/utils/logger'
import { shareSettings } from '@/utils/shareConfig'

import { defaultFormData } from './info'
import { createSettingsState } from './settingsState'
import type { DraftResolution } from './settingsState'

export * from './info'

export const appearanceConf = useStorageAsync(
  'appearance-conf',
  {
    hideHeader: false,
    changeIcon: false,
    dynamicTitle: false,
    changeBackground: false,
    blurCard: false,
    listSink: false,
    contentOffset: 25, // 0-25, 25则为关闭
    leftChat: false,
    chatBoxWidth: 600,
    defaultShowChatBox: false,
  },
  ExtStorage,
  { mergeDefaults: true },
)
const FROM_VERSION: [string, (from: Partial<FormData>) => Partial<FormData>][] = [
  [
    '20250826',
    (from) => {
      if (from.salaryRange && typeof from.salaryRange.value === 'string') {
        const [min, max] = (from.salaryRange.value as string).split('-').map(Number)
        from.salaryRange.value = [min ?? 0, max ?? 0, false]
      }
      if (from.companySizeRange && typeof from.companySizeRange.value === 'string') {
        const [min, max] = (from.companySizeRange.value as string).split('-').map(Number)
        from.companySizeRange.value = [min ?? 0, max ?? 0, false]
      }
      return from
    },
  ],
  [
    '20260521',
    (from) => {
      if (from.aiFiltering?.prompt) {
        if (typeof from.aiFiltering.prompt === 'string') {
          from.aiFiltering.prompt = [
            {
              role: 'user',
              content: from.aiFiltering.prompt,
            },
          ]
        }
      } else {
        from.aiFiltering = {
          ...defaultFormData.aiFiltering,
          ...from.aiFiltering,
          prompt: defaultFormData.aiFiltering.prompt,
        }
      }
      if (from.aiGreeting?.prompt) {
        if (typeof from.aiGreeting.prompt === 'string') {
          from.aiGreeting.prompt = [
            {
              role: 'user',
              content: from.aiGreeting.prompt,
            },
          ]
        }
      } else {
        from.aiGreeting = {
          ...defaultFormData.aiGreeting,
          ...from.aiGreeting,
          prompt: defaultFormData.aiGreeting.prompt,
        }
      }
      if (from.jobAddress) {
        from.jobAddress = {
          ...from.jobAddress,
          include: true,
        }
      }
      return from
    },
  ],
  [
    '20260718',
    (from) => {
      if (!('delay' in from) || typeof from.delay !== 'object') {
        return from
      }
      Object.entries(from.delay as Record<string, number>).forEach(([key, value]) => {
        // @ts-ignore
        from[`delay${key.charAt(0).toUpperCase() + key.slice(1)}`] = value
      })
      delete from['delay']
      return from
    },
  ],
]

function formDataHandler(from: Partial<FormData>) {
  for (let i = FROM_VERSION.length - 1; i >= 0; i--) {
    const [version, fn] = FROM_VERSION[i]!
    if ((from?.version ?? '20240401') >= version) break
    from = fn(from)
    from.version = version
  }
  return from
}

const settings = createSettingsState<FormData>(
  defaultFormData,
  {
    get: (key, fallback) => counter.storageGet(key, fallback),
    set: (key, value) => counter.storageSet(key, value),
  },
  formDataHandler,
)

export const useConf = (runtime = false) => {
  const toast = useToast()
  const formData = settings.formData

  async function notify(action: () => Promise<unknown>, success: string, failure: string) {
    try {
      await action()
      if (success) toast.add({ title: success, color: 'success' })
    } catch {
      // 不把存储异常的原始对象/文本写进日志，其中可能含配置和凭据。
      toast.add({ title: failure, color: 'error' })
      logger.error(failure)
      throw new Error(failure)
    }
  }

  const confInit = () => notify(settings.init, '', '配置加载失败，请重试。')
  const confSaving = () => notify(settings.save, '配置已保存', '保存失败，草稿已保留，请重试。')
  const saveProfile = (profile: FormData['profile']) =>
    notify(
      () => settings.saveField('profile', profile),
      '求职意向已保存，其他未保存设置保持不变',
      '求职意向保存失败，草稿已保留，请重试。',
    )

  async function confReload(resolution?: DraftResolution) {
    await notify(
      () => settings.reload(resolution),
      '已重载保存的配置',
      '重载失败，请先处理未保存更改或稍后重试。',
    )
  }

  async function confExport(backup = false) {
    await settings.init()
    const data = settings.getSavedSnapshot()
    exportJson(backup ? data : shareSettings(data), backup ? '个人配置备份-含密钥及简历' : '分享配置-不含个人资料')
  }

  async function confImport() {
    settings.assertEditable()
    const input = await importJson<Partial<FormData>>()
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('请选择打招呼配置文件，模型配置需在模型服务窗口导入')
    const jsonData = formDataHandler(input)
    // 选择文件期间可能已经开始运行。
    settings.assertEditable()
    deepmerge(formData, jsonClone(jsonData), { clone: false })
    toast.add({ title: '导入到草稿，请手动保存', color: 'success' })
  }

  function confRecommend() {
    settings.assertEditable()
    const keys = [
      'deliveryLimit',
      'runDeliveryLimit',
      'activityFilter',
      'friendStatus',
      'sameCompanyFilter',
      'sameHrFilter',
      'goldHunterFilter',
      'notification',
      'useCache',
    ] as const
    for (const key of keys) formData[key] = jsonClone(defaultFormData[key]) as any
    toast.add({ title: '推荐配置已应用到草稿，请手动保存或重载恢复', color: 'success' })
  }

  function confDelete() {
    settings.assertEditable()
    Object.assign(formData, jsonClone(defaultFormData))
    toast.add({ title: '已恢复默认草稿，不会自动保存，可重载恢复', color: 'success' })
  }

  const order: Record<ConfigLevel, number> = {
    beginner: 1,
    intermediate: 2,
    advanced: 3,
    expert: 4,
  }
  const configLevel = reactiveComputed(() => {
    const val = order[(runtime ? settings.getRuntimeData() : formData).configLevel]
    return {
      intermediate: order.intermediate <= val,
      advanced: order.advanced <= val,
      expert: order.expert <= val,
    }
  })

  async function createPreset(label: string, resolution?: DraftResolution) {
    await notify(
      () => settings.createPreset(label, resolution),
      '预设已创建',
      '预设创建失败，当前草稿已保留。',
    )
  }

  async function switchPreset(value: string, resolution?: DraftResolution) {
    await notify(
      () => settings.switchPreset(value, resolution),
      '已切换预设',
      '预设切换失败，当前草稿已保留。',
    )
  }

  return {
    confInit,
    confSaving,
    confReload,
    confExport,
    confImport,
    confDelete,
    confRecommend,
    saveProfile,
    configLevel,
    createPreset,
    switchPreset,
    defaultFormData,
    formDataKey: settings.formDataKey,
    get formData() {
      return runtime ? settings.getRuntimeData() : formData
    },
    formDataPreset: settings.formDataPreset,
    formDataPresets: settings.formDataPresets,
    isLoading: settings.isLoading,
    isDirty: settings.isDirty,
    isSaving: settings.isSaving,
    saveError: settings.saveError,
    runLocked: settings.runLocked,
    getSavedSnapshot: settings.getSavedSnapshot,
    beginRun: settings.beginRun,
    endRun: settings.endRun,
  }
}
