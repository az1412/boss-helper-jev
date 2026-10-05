import type { FormDataAi } from '@/types/formData'
import { renderTemplate } from '@/utils/ai'
import { jsonClone } from '@/utils/deepmerge'

import type { WorkflowData } from '../useApplying/type'
import type { HelperContext } from '../useHelper'
import { generateModelText } from './generate'
import { normalizeModelConfig } from './openai'
import type { OpenaiLLMConf } from './openai'
import { explainProbeError } from './probe'

type Role = 'filtering' | 'greetings'
export class ChatModel {
  private agents = new Map<Role, { conf: OpenaiLLMConf; model: FormDataAi; json: boolean }>()
  constructor(public ctx: HelperContext<any, any, any>) {}
  createAgent(model: FormDataAi, name: Role, opt?: { json?: boolean }): boolean {
    this.agents.delete(name)
    const conf = this.ctx.models.modelData.value.find((m) => m.key === model.model)
    if (!conf?.data || !model.model) return false
    const prompt = model.prompt
    if (
      typeof prompt === 'string'
        ? !prompt.trim()
        : !Array.isArray(prompt) ||
          !prompt.length ||
          prompt.some(
            (item) =>
              !['user', 'assistant', 'system'].includes(item.role) ||
              typeof item.content !== 'string' ||
              !item.content.trim(),
          )
    )
      throw new Error('请填写并保存有效的 AI 提示词')
    this.agents.set(name, {
      conf: normalizeModelConfig(conf.data),
      model: jsonClone(model),
      json: !!opt?.json,
    })
    return true
  }
  async chat(
    name: Role,
    data: WorkflowData<any, any>,
    options: { signal?: AbortSignal; disableMessages?: boolean } = {},
  ) {
    const agent = this.agents.get(name)
    if (!agent) throw new Error('请先选择并保存 AI 模型')
    const prompt = agent.model.prompt
    const messages =
      typeof prompt === 'string' ? [{ role: 'user' as const, content: prompt }] : jsonClone(prompt)
    for (const message of messages) message.content = renderTemplate(message.content, data)
    try {
      return await generateModelText(agent.conf, messages, {
        json: agent.json,
        signal: options.signal,
      })
    } catch (e) {
      throw new Error(explainProbeError(e))
    }
  }
}
