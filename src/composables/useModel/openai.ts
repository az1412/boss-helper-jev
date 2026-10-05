import { createOpenAI } from '@ai-sdk/openai'
import type { LanguageModelV3 } from '@ai-sdk/provider'

import { counter } from '@/message'

import { desc, other } from './common'
import type { LLMConf, LLMInfo } from './type'

export type OpenaiLLMConf = LLMConf<
  'openai',
  {
    avatar: string
    base_url: string
    api_key: string
    model: string
    responses?: boolean
    other: other['other']
    advanced: {
      json?: boolean | true
      stream?: boolean | true

      temperature?: number
      top_p?: number
      presence_penalty?: number
      frequency_penalty?: number

      tool_choice?: string
      tools?: Array<Record<string, any>>

      extra_headers?: Record<string, string>
      extra_body?: object
    }
  }
>

const info: LLMInfo<OpenaiLLMConf> = {
  mode: {
    mode: 'openai',
    label: 'OpenAI',
  },
  avatar: {
    type: 'input',
    format: 'avatar',
    required: true,
  },
  base_url: {
    label: '接口地址',
    desc: '在上方选一家供应商会自动填好。用中转站就填它给你的地址，一般以 /v1 结尾。粘错整段也没关系，会自动纠正。',
    type: 'input',
    config: {
      placeholder: 'https://api.deepseek.com',
    },
    required: true,
  },
  api_key: {
    label: '密钥',
    desc: '你的 API Key，从供应商后台复制粘贴进来。',
    type: 'input',
    config: {
      placeholder: 'sk-...',
      type: 'password',
    },
    required: true,
  },
  model: {
    label: '模型',
    desc: '要用哪个模型。选供应商后点下方示例即可，也可手动输入。',
    config: {
      placeholder: 'deepseek-chat',
    },
    value: 'deepseek-chat',
    type: 'input',
    required: true,
  },
  responses: {
    label: '用 Responses 接口',
    value: false,
    type: 'switch',
    desc: '一般不用开。大多数中转站不支持，保持关闭即可。',
  },
  other,
  advanced: {
    label: '高级配置',
    alert: 'warning',
    desc: '小白勿动',
    value: {
      json: {
        value: true,
        type: 'switch',
        desc: '仅支持较新的模型,会强制gpt返回json格式,效果好一点,能有效减少响应解析错误',
        config: {
          disabled: true,
        },
      },
      stream: {
        value: false,
        type: 'switch',
        desc: desc.stream,
        config: {
          disabled: true,
        },
      },
      temperature: {
        type: 'slider',
        config: {
          min: 0,
          max: 2,
          step: 0.05,
        },
        desc: '较高的值（如 0.8）将使输出更加随机，而较低的值（如 0.2）将使其更加集中和确定性。<br/>我们通常建议更改此项或 top_p ，但不要同时更改两者。',
      },
      top_p: {
        type: 'slider',
        config: {
          min: 0,
          max: 1,
          step: 0.05,
        },
        desc: '温度采样的替代方法称为核采样，其中模型考虑具有 top_p 概率质量的标记的结果。因此 0.1 意味着仅考虑包含前 10% 概率质量的标记。<br/>我们通常建议更改此项或 temperature ，但不要同时更改两者。',
      },
      presence_penalty: {
        value: 0,
        type: 'slider',
        config: {
          min: -2,
          max: 2,
          step: 0.1,
        },
        desc: '正值根据新标记是否出现在文本中来对其进行惩罚，从而增加模型讨论新主题的可能性。',
      },
      frequency_penalty: {
        type: 'slider',
        config: {
          min: -2,
          max: 2,
          step: 0.1,
        },
        desc: '正值根据迄今为止文本中的现有频率对新标记进行惩罚，从而降低模型逐字重复同一行的可能性。',
      },
      tool_choice: {
        type: 'input',
        format: 'menu',
        config: {
          items: ['auto', 'none'],
          createItem: true,
        },
        desc: '工具使用策略, auto表示模型根据输入自动决定是否使用工具, none表示不使用工具',
        condition: 'responses',
      },
      tools: {
        type: 'input',
        format: 'json',
        desc: '暂时仅支持model自带tool, 例如: [{"type": "web_search"}]',
        condition: 'responses',
      },
      extra_headers: {
        type: 'input',
        format: 'json',
        desc: '额外的请求头, 可以用来传一些特殊的认证信息, 例如x-access-token等, 需要填写json格式字符串, 例如{"x-access-token":"xxxx"}',
      },
      extra_body: {
        type: 'input',
        format: 'json',
        desc: '额外的请求体参数, 可以用来传一些特殊的参数, 需要填写json格式字符串, 例如{"key":"value"}',
      },
    },
  },
}

/**
 * 归一化 base_url，消除中转站最常见的两类填写错误：
 * 1. 结尾多余的斜杠
 * 2. 误把完整 endpoint（.../v1/chat/completions）当作 base 粘进来，
 *    而 @ai-sdk/openai 会再拼一次 /chat/completions，导致 404。
 * 不强制补 /v1：各家中转站规范不一（deepseek 带不带都行），补错反而更糟。
 */
export function normalizeBaseUrl(input?: string): string {
  let url = (input ?? '').trim()
  if (!url) return url
  url = url.replace(/\/+$/, '')
  url = url.replace(/\/(chat\/completions|completions|responses|models)$/i, '')
  url = url.replace(/\/+$/, '')
  return url
}

/**
 * 创建 provider 的唯一入口。测试路径（createModel）和真实筛选路径
 * （chatModel.ts:createAgent）都必须走这里，否则 base_url 归一化、
 * extra_headers、CORS 兜底 fetch 会在两条路上各写一份、行为不一致
 * —— 这正是「测试通过但实跑失败」的根因。
 */
export function createProvider(
  conf: OpenaiLLMConf,
  opts: { fetch?: typeof globalThis.fetch } = {},
) {
  const data = normalizeModelConfig(conf)
  const fetcher =
    opts.fetch ??
    (data.other.background ? createBackgroundFetch(data.other.timeout) : globalThis.fetch)
  return createOpenAI({
    baseURL: data.base_url,
    apiKey: data.api_key,
    headers: data.advanced.extra_headers,
    fetch: async (url, init) => {
      if (data.advanced.extra_body && typeof init?.body === 'string') {
        init = {
          ...init,
          body: JSON.stringify({ ...data.advanced.extra_body, ...JSON.parse(init.body) }),
        }
      }
      return fetcher(url, init)
    },
  })
}

/**
 * 一个 fetch 兼容函数：把请求丢给后台 Service Worker 去发，绕过内容脚本的跨域限制。
 * 用于「后台请求」开关打开时。注意会把响应整体缓冲后一次性返回（不再逐字流式），
 * 对岗位筛选没影响——筛选只要最终结果。
 */
export function createBackgroundFetch(timeout = 1800): typeof globalThis.fetch {
  const bgFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url
    const headers: Record<string, string> = {}
    new Headers(init?.headers).forEach((v, k) => {
      headers[k] = v
    })
    const body = typeof init?.body === 'string' ? init.body : undefined
    init?.signal?.throwIfAborted()
    const res = await counter.aiFetch({
      url,
      timeout,
      init: { method: init?.method, headers, body },
    })
    init?.signal?.throwIfAborted()
    // 后台已 res.text() 解码过 body，这里若再带上原始的编码/长度头，
    // 消费方会按压缩/错误长度去解析 → 解析失败。剔掉它们。
    const respHeaders = { ...res.headers }
    delete respHeaders['content-encoding']
    delete respHeaders['content-length']
    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: respHeaders,
    })
  }
  return bgFetch as typeof globalThis.fetch
}

const createModel: (
  conf: OpenaiLLMConf,
  opts?: { fetch?: typeof globalThis.fetch },
) => LanguageModelV3 = (conf, opts) => {
  const provider = createProvider(conf, opts)
  if (conf.responses) {
    return provider.responses(conf.model)
  }
  return provider.chat(conf.model)
}

export const openai = {
  createModel,
  createProvider,
  createBackgroundFetch,
  normalizeBaseUrl,
  info,
}

export function normalizeModelConfig(input: unknown, allowEmptyKey = false): OpenaiLLMConf {
  if (!input || typeof input !== 'object') throw new Error('模型配置为空')
  const data = JSON.parse(JSON.stringify(input)) as OpenaiLLMConf
  if (data.mode && data.mode !== 'openai') throw new Error('仅支持 OpenAI 兼容接口')
  data.mode = 'openai'
  data.base_url = normalizeBaseUrl(data.base_url)
  let url: URL
  try {
    url = new URL(data.base_url)
  } catch {
    throw new Error('请填写完整的 http(s) 接口地址')
  }
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error('接口地址须使用 http(s)，且不能包含账号、密钥、查询参数或锚点')
  if (typeof data.api_key !== 'string' || (!allowEmptyKey && !data.api_key.trim()))
    throw new Error('请填写 API Key')
  if (typeof data.model !== 'string' || !data.model.trim()) throw new Error('请填写模型名称')
  data.api_key = data.api_key.trim()
  data.model = data.model.trim()
  data.other ??= {}
  data.advanced ??= {}
  if (
    typeof data.other !== 'object' ||
    Array.isArray(data.other) ||
    typeof data.advanced !== 'object' ||
    Array.isArray(data.advanced)
  )
    throw new Error('高级配置与网络选项必须是对象')
  if (data.responses !== undefined && typeof data.responses !== 'boolean')
    throw new Error('接口类型设置无效')
  for (const key of ['json', 'stream'] as const)
    if (data.advanced[key] !== undefined && typeof data.advanced[key] !== 'boolean')
      throw new Error(`${key} 必须是开关`)
  if (data.other.background !== undefined && typeof data.other.background !== 'boolean')
    throw new Error('后台请求必须是开关')
  if (
    data.other.timeout !== undefined &&
    (!Number.isFinite(data.other.timeout) || data.other.timeout <= 0 || data.other.timeout > 86400)
  )
    throw new Error('请求超时必须在 0–86400 秒之间')
  for (const [key, min, max] of [
    ['temperature', 0, 2],
    ['top_p', 0, 1],
    ['presence_penalty', -2, 2],
    ['frequency_penalty', -2, 2],
  ] as const) {
    const value = data.advanced[key]
    if (value !== undefined && (!Number.isFinite(value) || value < min || value > max))
      throw new Error(`${key} 必须在 ${min}–${max} 之间`)
  }
  for (const key of ['extra_headers', 'extra_body'] as const) {
    let value: unknown = data.advanced[key]
    if (typeof value === 'string') {
      try {
        value = value.trim() ? JSON.parse(value) : undefined
      } catch {
        throw new Error(`${key} 必须是合法 JSON 对象`)
      }
    }
    if (value !== undefined && (!value || typeof value !== 'object' || Array.isArray(value)))
      throw new Error(`${key} 必须是 JSON 对象`)
    if (
      key === 'extra_headers' &&
      value &&
      Object.entries(value).some(([name, val]) => !name.trim() || typeof val !== 'string')
    )
      throw new Error('请求头名称和内容必须是字符串')
    ;(data.advanced as any)[key] = value
  }
  if (data.advanced.tools?.length || data.advanced.tool_choice)
    throw new Error('本项目只生成筛选结果和招呼语，请移除 tools / tool_choice 参数')
  return data
}
