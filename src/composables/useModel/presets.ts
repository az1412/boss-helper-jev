/**
 * 供应商预设。仿 CCSwitch 的思路：用户从列表里选一家，接口地址自动填好，
 * 只需要粘一下自己的密钥即可——不用再去搞懂 base_url 该写成什么样。
 *
 * 只放接口地址（这个稳定），模型名只给一两个当例子（模型更新快，用户可自己改）。
 * 最后一项「自定义 / 中转站」留给用的是别的中转站的人。
 */
export interface ProviderPreset {
  id: string
  /** 展示给用户的友好名 */
  name: string
  /** 接口地址；自定义留空 */
  baseUrl: string
  /** 常用模型示例，点一下就填进去 */
  models: string[]
  /** 去哪拿密钥 */
  apiKeyUrl?: string
  /** 一句人话提示 */
  note?: string
}

export const providerPresets: ProviderPreset[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek 深度求索',
    baseUrl: 'https://api.deepseek.com',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    apiKeyUrl: 'https://platform.deepseek.com/api_keys',
    note: '便宜好用，筛选岗位够了',
  },
  {
    id: 'siliconflow',
    name: '硅基流动 SiliconFlow',
    baseUrl: 'https://api.siliconflow.cn/v1',
    models: ['deepseek-ai/DeepSeek-V3', 'Qwen/Qwen2.5-7B-Instruct'],
    apiKeyUrl: 'https://cloud.siliconflow.cn/account/ak',
    note: '国内直连快，模型名带厂商前缀',
  },
  {
    id: 'moonshot',
    name: '月之暗面 Kimi',
    baseUrl: 'https://api.moonshot.cn/v1',
    models: ['moonshot-v1-8k', 'kimi-latest'],
    apiKeyUrl: 'https://platform.moonshot.cn/console/api-keys',
  },
  {
    id: 'zhipu',
    name: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: ['glm-4-flash', 'glm-4-plus'],
    apiKeyUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
    note: '模型是否可用与收费以供应商当前说明为准',
  },
  {
    id: 'dashscope',
    name: '阿里百炼 通义千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: ['qwen-plus', 'qwen-turbo'],
    apiKeyUrl: 'https://bailian.console.aliyun.com/',
  },
  {
    id: 'volces',
    name: '火山方舟 豆包',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    models: [],
    apiKeyUrl: 'https://console.volcengine.com/ark',
    note: '模型名要填「推理接入点 ID」，不是模型名',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter 聚合',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: ['deepseek/deepseek-chat', 'openai/gpt-4o-mini'],
    apiKeyUrl: 'https://openrouter.ai/keys',
    note: '一个 key 用全球模型，需要网络能访问',
  },
  {
    id: 'openai',
    name: 'OpenAI 官方',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o-mini', 'gpt-4o'],
    apiKeyUrl: 'https://platform.openai.com/api-keys',
    note: '需要国外网络与支付方式',
  },
  {
    id: 'custom',
    name: '自定义 / 中转站',
    baseUrl: '',
    models: [],
    note: '填你的中转站地址，通常以 /v1 结尾。粘错整段 /chat/completions 也没关系，会自动纠正',
  },
]

/** 反查：根据已填的接口地址匹配到某个预设（编辑已有模型时高亮当前供应商）。 */
export function matchPreset(baseUrl?: string): ProviderPreset | undefined {
  if (!baseUrl) return undefined
  const u = baseUrl.trim().replace(/\/+$/, '')
  return providerPresets.find((p) => p.baseUrl && p.baseUrl.replace(/\/+$/, '') === u)
}
