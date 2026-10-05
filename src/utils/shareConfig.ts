import type { ModelConf } from '../composables/useModel'
import type { FormData } from '../types/formData'
import { jsonClone } from './deepmerge'

/** 白名单导出：自由提示词、简历、消息、地址与凭据均不进入分享文件。 */
export function shareSettings(data: FormData): Partial<FormData> {
  const shared: Partial<FormData> = {}
  for (const key of [
    'version',
    'configLevel',
    'deliveryLimit',
    'runDeliveryLimit',
    'delayDeliveryStarts',
    'delayDeliveryInterval',
    'delayDeliveryPageNext',
    'delayMessageSending',
    'activityFilter',
    'friendStatus',
    'sameCompanyFilter',
    'sameHrFilter',
    'goldHunterFilter',
    'bossGoldMedalHr',
    'notification',
    'useCache',
    'salaryRange',
    'companySizeRange',
  ] as const) {
    if (data[key] !== undefined) shared[key] = jsonClone(data[key]) as never
  }
  // 分享文件导入后默认只做基础筛选，需自行配置服务再启用。
  shared.jev = { enable: false, apiKey: '', model: data.jev.model, mode: data.jev.mode }
  return shared
}
export function shareModels(models: readonly ModelConf[]): ModelConf[] {
  return models.map((item, index) => ({
    key: item.key,
    name: `模型 ${index + 1}`,
    data: item.data
      ? {
          mode: 'openai',
          avatar: '',
          base_url: item.data.base_url,
          model: item.data.model,
          api_key: '',
          responses: item.data.responses,
          other: jsonClone(item.data.other ?? {}),
          advanced: Object.fromEntries(
            ['json', 'stream', 'temperature', 'top_p', 'presence_penalty', 'frequency_penalty']
              .filter((key) => (item.data!.advanced as any)?.[key] !== undefined)
              .map((key) => [key, (item.data!.advanced as any)[key]]),
          ),
        }
      : undefined,
  }))
}
