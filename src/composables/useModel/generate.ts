import { generateText, streamText, Output } from 'ai'
import type { ModelMessage } from 'ai'

import { normalizeModelConfig, openai } from './openai'

export class ModelResponseError extends Error {
  constructor(kind: 'empty' | 'cancelled') {
    super(
      kind === 'empty'
        ? '模型未返回可发送的正文；请检查是否仅返回思考内容、被拦截或输出额度不足'
        : '模型请求已取消',
    )
    this.name = 'ModelResponseError'
  }
}

/** 模型测试、提示词测试和投递均走同一组参数及接口。 */
export async function generateModelText(
  input: unknown,
  messages: ModelMessage[],
  options: {
    json?: boolean
    signal?: AbortSignal
    fetch?: typeof globalThis.fetch
  } = {},
) {
  const conf = normalizeModelConfig(input)
  const advanced = conf.advanced
  const signal = AbortSignal.timeout(Math.ceil((conf.other.timeout ?? 1800) * 1000))
  const settings = {
    model: openai.createModel(conf, { fetch: options.fetch }),
    messages,
    output: options.json && advanced.json !== false ? Output.json() : Output.text(),
    temperature: advanced.temperature,
    topP: advanced.top_p,
    presencePenalty: advanced.presence_penalty,
    frequencyPenalty: advanced.frequency_penalty,
    maxRetries: 0,
    abortSignal: options.signal ? AbortSignal.any([signal, options.signal]) : signal,
  }
  if (advanced.stream === false) {
    const result = await generateText(settings)
    if (!result.text.trim()) throw new ModelResponseError('empty')
    return { text: result.text, reasoningText: result.reasoningText }
  }
  const result = streamText({ ...settings, onError() {} })
  let text = ''
  for await (const part of result.fullStream) {
    if (part.type === 'error') throw part.error
    if (part.type === 'abort') throw new ModelResponseError('cancelled')
    if (part.type === 'text-delta') text += part.text
  }
  if (!text.trim()) throw new ModelResponseError('empty')
  return { text, reasoningText: await result.reasoningText }
}
