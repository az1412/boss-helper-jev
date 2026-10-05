import { counter } from '@/message'

/**
 * TypeSafe System One（Jev）客户端。
 *
 * 只封 HTTP：喂一段 state + 一组类型化问题，拿回每题的类型化判断。
 * 走后台请求桥（counter.aiFetch）在 Service Worker 里发，绕过内容脚本的跨域限制。
 * 判定/合成逻辑不在这，在 jevFilter.ts —— 这里不做决策。
 */

const ENDPOINT = 'https://api.typesafe.ai/v1/systemone'

export type JevQuestion =
  | { type: 'noul'; instructions: string }
  | { type: 'score'; instructions: string; criteria: string[] }
  | { type: 'choice'; instructions: string; criteria: Record<string, string> }

export interface JevNoulAnswer {
  type: 'noul'
  noul: number
}
export interface JevScoreAnswer {
  type: 'score'
  score: number
  legend?: Record<string, string>
  confidence?: number
}
export interface JevChoiceAnswer {
  type: 'choice'
  choice: string
  probabilities?: Record<string, number>
  confidence?: number
}
export type JevAnswer = JevNoulAnswer | JevScoreAnswer | JevChoiceAnswer

export interface JevResponse {
  model: string
  answers: Record<string, JevAnswer>
  usage?: { input_tokens: number; output_tokens: number }
}

export interface JevRequest {
  apiKey: string
  model?: string
  state: string
  questions: Record<string, JevQuestion>
}

export async function jevSystemOne(req: JevRequest): Promise<JevResponse> {
  if (!req.apiKey) {
    throw new Error('未填写 TypeSafe API Key')
  }
  const body = JSON.stringify({
    state: req.state,
    model: req.model || 'jev-latest',
    questions: req.questions,
  })
  // aiFetch 不因 4xx 抛错，返回 { status, body }，这里自己判。
  const res = await counter.aiFetch({
    url: ENDPOINT,
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${req.apiKey.trim()}`,
      },
      body,
    },
  })
  if (res.status < 200 || res.status >= 300) {
    const hint =
      res.status === 401 || res.status === 403
        ? 'API Key 不对或无权限'
        : res.status === 429
          ? '限流或余额不足'
          : res.status >= 500
            ? '服务端故障'
            : '请求被拒'
    throw new Error(`TypeSafe 请求失败 ${res.status}（${hint}）`)
  }
  try {
    const data = JSON.parse(res.body) as JevResponse
    for (const [key, question] of Object.entries(req.questions)) {
      const answer = data?.answers?.[key]
      if (!answer || answer.type !== question.type) throw new Error('missing answer')
      if (
        answer.type === 'score' &&
        (!Number.isFinite(answer.score) || answer.score < 0 || answer.score > 5)
      )
        throw new Error('invalid score')
      if (
        answer.type === 'noul' &&
        (!Number.isFinite(answer.noul) || answer.noul < 0 || answer.noul > 1)
      )
        throw new Error('invalid probability')
    }
    return data
  } catch {
    throw new Error('TypeSafe 返回格式不完整或数值无效，本轮已停止，请稍后重试')
  }
}
