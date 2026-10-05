import { counter } from '@/message'

import { createModelSettings } from './modelSettings'
import type { OpenaiLLMConf } from './openai'
import { openai } from './openai'

export * from './chatModel'
export const confModelKey = 'conf-model'
export const llms = [openai.info]
export type ModelConfData = OpenaiLLMConf
export interface ModelConf {
  key: string
  name: string
  color?: string
  data?: ModelConfData
}
const store = createModelSettings({
  get: () => counter.storageGet<ModelConf[]>(confModelKey, []),
  set: (models) => counter.storageSet(confModelKey, models),
})
export const useModel = () => store
