import type { LLMInfo } from './type'

export interface other {
  other: {
    timeout?: number
    background?: boolean
  }
}

export const other: LLMInfo<other>['other'] = {
  value: {
    timeout: {
      value: 1800,
      type: 'input',
      format: 'number',
      desc: 'GPT 请求超时时间（秒），超时后不重试、直接跳过该岗位。默认 1800 秒 / 30 分钟。中转站较慢可适当调大。',
    },
    background: {
      value: false,
      type: 'switch',
      label: '后台请求',
      desc: '测试或筛选报「跨域 / 网络失败」时打开：改由扩展后台发请求，可绕过多数中转站的跨域限制。开启后不再逐字显示，但筛选结果不受影响。',
    },
  },
  alert: 'warning',
  label: '其他配置',
}

export const desc = {
  stream: '推荐开启,可以实时查看gpt返回的响应,但如果你的模型不支持,请关闭',
  max_tokens: '用处不大一般不需要调整',
  temperature: '较高的数值会使输出更加随机，而较低的数值会使其更加集中和确定',
  top_p: '影响输出文本的多样性，取值越大，生成文本的多样性越强',
}
