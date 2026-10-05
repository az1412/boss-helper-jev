import type { JobData } from '@/composables/useHelper'
import type { Strictness } from '@/composables/useModel/simplePrompt'
import { jevSystemOne } from '@/composables/useModel/typesafe'
import type { JevQuestion, JevResponse } from '@/composables/useModel/typesafe'

import { cachedJevJudgment } from './jevCache'

/**
 * 用 Jev 的类型化判断做「投/不投 + 契合度」。
 *
 * - 每条「想要」→ 一个 Noul（是/否概率）
 * - 每条「不想要」→ 一个 Noul
 * - 一个「契合度 0~5」→ Score，用于排序
 * 合成规则纯代码：命中任一「不想要」→ 不投；「想要」命中数按严格程度定阈值。
 * 没有 JSON 解析，接口天生结构化。
 */

const YES = 0.6 // Noul 概率 ≥ 此值算「是」
const MAX_ITEMS = 8 // 每类最多几条，控制 token 与延迟

export interface JevJudgment {
  pass: boolean
  score: number // 契合度 0~5
  reason: string
  threshold?: number
  conditions?: Array<{ label: string; kind: 'want' | 'avoid'; value: number; hit: boolean }>
}

function splitItems(text?: string): string[] {
  if (!text) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of text.split(/[、,，;；\n]+/)) {
    const t = raw.trim()
    if (t && !seen.has(t)) {
      seen.add(t)
      out.push(t)
    }
    if (out.length >= MAX_ITEMS) break
  }
  return out
}

/**
 * 从岗位数据拼出喂给 Jev 的 state 文本。
 * 关键：必须把求职者的诉求（想要/不想要）也放进来，否则「契合度」这个问题
 * 无从判断"和谁契合"，只能瞎给分——这正是之前 500 个只过 2 个的主因。
 */
export interface JobStateProfile {
  targetJob?: string
  resume?: string
  want?: string
  avoid?: string
}

export function buildJobState(job: JobData, profile: JobStateProfile = {}): string {
  const lines = [
    `岗位名：${job.jobName ?? ''}`,
    `薪资：${job.salary ?? '面议'}`,
    `学历要求：${job.degreeName ?? '不限'}`,
    `经验要求：${job.experienceName ?? '不限'}`,
    `公司：${job.brand?.name ?? ''}（${job.brand?.industry ?? ''} / ${job.brand?.scale ?? ''}）`,
    `地址：${job.address ?? ''}`,
    `福利：${Array.isArray(job.welfareList) ? job.welfareList.join('、') : ''}`,
    `技能：${Array.isArray(job.skills) ? job.skills.join('、') : ''}`,
    `标签：${Array.isArray(job.jobLabels) ? job.jobLabels.join('、') : ''}`,
    `岗位描述：\n${job.jobDescription ?? ''}`,
  ]
  const target = (profile.targetJob ?? '').trim()
  const resume = (profile.resume ?? '').trim()
  const w = (profile.want ?? '').trim()
  const a = (profile.avoid ?? '').trim()
  if (target || resume || w || a) {
    lines.push('', '=== 求职者情况与诉求（用于判断契合度）===')
    if (target) lines.push(`目标岗位/方向：${target}`)
    if (resume) lines.push(`本人简介：${resume.slice(0, 1200)}`)
    if (w) lines.push(`想要：${w}`)
    if (a) lines.push(`想避免：${a}`)
  }
  return lines.join('\n')
}

export function buildJevQuestions(want?: string, avoid?: string): Record<string, JevQuestion> {
  const q: Record<string, JevQuestion> = {}
  splitItems(want).forEach((w, i) => {
    q[`want_${i}`] = {
      type: 'noul',
      instructions: `这个岗位是否满足求职者想要的一点：「${w}」？如果岗位信息没提到、无法判断，请倾向于「是/中性」，不要因为没写就判否。`,
    }
  })
  splitItems(avoid).forEach((a, i) => {
    q[`avoid_${i}`] = {
      type: 'noul',
      instructions: `这个岗位是否明确属于或需要求职者想避免的一点：「${a}」？只有岗位信息里有明确证据时才判「是」。`,
    }
  })
  q.fit = {
    type: 'score',
    instructions:
      '结合上面「求职者诉求」，综合判断这个岗位整体上有多适合该求职者去投递。诉求里没提到的方面不必苛责，只要岗位本身正常、没有明显冲突就应给出中等偏上的分。',
    criteria: ['完全不合适', '较差', '一般', '尚可', '不错', '非常契合'],
  }
  return q
}

// 契合度阈值（0~5）：主闸门。分数 ≥ 阈值才投。
// 松紧只调这条线，符合直觉："严格"= 要求更契合，"宽松"= 差不多就投。
const FIT_THRESHOLD: Record<Strictness, number> = {
  loose: 1.5,
  normal: 2.5,
  strict: 3.5,
}
const AVOID_YES = 0.7 // 「不想要」一票否决要更有把握，避免误杀

export function judgeJev(res: JevResponse, strictness: Strictness): JevJudgment {
  let wantTotal = 0
  let wantHits = 0
  const avoidHits: string[] = []
  let score = 0
  let hasFit = false

  for (const [key, ans] of Object.entries(res.answers ?? {})) {
    if (key === 'fit' && ans.type === 'score') {
      score = ans.score
      hasFit = true
      continue
    }
    if (ans.type !== 'noul') continue
    if (key.startsWith('want_')) {
      wantTotal++
      if (ans.noul >= YES) wantHits++
    } else if (key.startsWith('avoid_') && ans.noul >= AVOID_YES) {
      avoidHits.push(key)
    }
  }

  // 1) 命中「不想要」→ 一票否决（这是硬性排雷，符合用户预期）
  if (avoidHits.length > 0) {
    return {
      pass: false,
      score,
      reason: `命中 ${avoidHits.length} 条「不想要」，契合度 ${score}/5`,
      threshold: FIT_THRESHOLD[strictness],
    }
  }
  // 2) 主闸门 = 契合度分数。想要命中数只作参考展示，不再当硬门槛。
  const threshold = FIT_THRESHOLD[strictness]
  // 兜底：万一某些中转/模型没返回 fit 分，退回到「命中过任一想要 或 无想要清单」
  const pass = hasFit ? score >= threshold : wantTotal === 0 || wantHits > 0
  const wantInfo = wantTotal > 0 ? `，命中想要 ${wantHits}/${wantTotal}` : ''
  return {
    pass,
    score,
    threshold,
    reason: pass
      ? `契合度 ${score}/5${wantInfo}`
      : `契合度 ${score}/5（需 ≥${threshold}）${wantInfo}`,
  }
}

export interface JevJudgeOptions {
  apiKey: string
  model?: string
  targetJob?: string
  resume?: string
  want?: string
  avoid?: string
  strictness: Strictness
  signal?: AbortSignal
}

/**
 * 取或算一次 Jev 判定，结果缓存在 job 的 state 上（键 __jev），
 * 保证预打分阶段和流水线筛选阶段共用一次调用、不重复请求。
 */
export async function getOrComputeJevJudgment(
  state: Record<string, any>,
  job: JobData,
  opts: JevJudgeOptions,
): Promise<JevJudgment> {
  const input = {
    model: opts.model || 'jev-latest',
    state: buildJobState(job, opts),
    questions: buildJevQuestions(opts.want, opts.avoid),
    strictness: opts.strictness,
  }
  // 工作流每轮更新标识。仅同轮允许 JD/详细地址补齐，不会因此再请求一次；
  // 列表字段、求职意向、问题、模型、严格度改变仍失效。跨轮比较全部实际输入。
  const runId = state.__jevRunId
  const runSource =
    typeof runId === 'string' || typeof runId === 'number'
      ? JSON.stringify([
          runId,
          job.key,
          buildJobState({ ...job, address: '', jobDescription: '' }, opts),
          input.questions,
          input.model,
          input.strictness,
        ])
      : undefined
  return cachedJevJudgment(
    state,
    input,
    async () => {
      const res = await jevSystemOne({
        apiKey: opts.apiKey,
        model: input.model,
        state: input.state,
        questions: input.questions,
      })
      const judgment = judgeJev(res, input.strictness)
      judgment.conditions = (['want', 'avoid'] as const).flatMap((kind) =>
        splitItems(opts[kind]).flatMap((label, i) => {
          const answer = res.answers[`${kind}_${i}`]
          if (!answer || answer.type !== 'noul') return []
          return [
            {
              label,
              kind,
              value: answer.noul,
              hit: answer.noul >= (kind === 'want' ? YES : AVOID_YES),
            },
          ]
        }),
      )
      return judgment
    },
    runSource,
  )
}
