import type { Prompt } from '@/types/formData'

/**
 * 简单模式：把普通用户填的大白话，生成成引擎能用的 prompt。
 *
 * 目的：普通人不用懂「system/user 角色、{{变量}}、JSON 格式、-100~100 分数」这些。
 * 他们只填三样——想要什么样的工作、不想要什么、以及自我介绍——剩下的技术脚手架
 * 在这里固定拼好、藏起来。高级用户仍可切到高级模式直接编辑 prompt。
 */

export type Strictness = 'loose' | 'normal' | 'strict'

export const strictnessOptions: { value: Strictness; label: string; desc: string }[] = [
  { value: 'loose', label: '宽松', desc: '只要不踩雷就投，投得多' },
  { value: 'normal', label: '适中', desc: '符合几条要求才投（推荐）' },
  { value: 'strict', label: '严格', desc: '要求都对上才投，投得少但准' },
]

const STRICTNESS_SCORE: Record<Strictness, number> = {
  loose: 0,
  normal: 10,
  strict: 30,
}

export function strictnessToScore(s: Strictness): number {
  return STRICTNESS_SCORE[s] ?? 10
}

export function scoreToStrictness(score: number | undefined): Strictness {
  if (score == null) return 'normal'
  if (score <= 0) return 'loose'
  if (score >= 20) return 'strict'
  return 'normal'
}

/** 给普通用户的示例默认值——不是空的，能照着改 */
export const defaultSimpleFiltering = {
  want: '双休、五险一金、早九晚六、离家近、技术氛围好',
  avoid: '需要上门、纯销售、需要拉客户、加班严重、压工资',
  strictness: 'normal' as Strictness,
}

export const defaultSimpleGreeting = {
  profile: '我叫小王，3 年前端经验，会 Vue/React，希望找双休、技术氛围好的团队。',
}

// 岗位信息块（固定机械部分，普通用户看不到）。变量由 mitem 模板引擎渲染。
const JOB_BLOCK_FILTERING = `## 待处理的岗位信息:
<岗位信息>
岗位名:{{ jobData.jobName }}   薪资: {{ jobData.salary }}
学历要求: {{ jobData.degreeName }}    工作经验要求: {{ jobData.experienceName }}
福利列表: {{ jobData.welfareList }}
技能要求: {{ jobData.skills }}
岗位标签:{{ jobData.jobLabels }}
  <岗位描述>
  {{ jobData.jobDescription }}
  <岗位描述/>
</岗位信息>`

const JOB_BLOCK_GREETING = `### 待处理的岗位信息:
<岗位信息>
岗位名:{{ jobData.jobName }}   薪资: {{ jobData.salary }}
学历要求: {{ jobData.degreeName }}
技能要求: {{ jobData.skills }}
岗位标签:{{ jobData.jobLabels }}
  <岗位描述>
  {{ jobData.jobDescription }}
  <岗位描述/>
</岗位信息>`

/** 由「想要 / 不想要」生成过滤 prompt。JSON 结构必须与 parseFiltering 对齐。 */
export function buildFilteringPrompt(want: string, avoid: string): Prompt {
  const w = want.trim() || '（没有特别要求）'
  const a = avoid.trim() || '（没有特别要求）'
  return [
    {
      role: 'system',
      content: `你在帮我筛选 BOSS 直聘上的招聘岗位。我给你一条岗位信息，你判断它符不符合我的要求。

【我想要的】命中越多越好：
${w}

【我不想要的】命中就要扣分：
${a}

只返回下面这个 JSON，不要输出任何多余文字：
interface 项 { reason: string; score: number } // score 为正整数，一般填 10
interface 结果 { positive: 项[]; negative: 项[] }
- 岗位每符合一条「我想要的」，就加一个 positive 项
- 岗位每命中一条「我不想要的」，就加一个 negative 项`,
    },
    { role: 'user', content: JOB_BLOCK_FILTERING },
  ]
}

/** 由「自我介绍 / 求职诉求」生成招呼语 prompt。 */
export function buildGreetingPrompt(profile: string): Prompt {
  const p = profile.trim() || '（未填写，请写一句得体的通用开场白）'
  return [
    {
      role: 'system',
      content: `你帮我给招聘的 HR 写第一句招呼语。

【我的情况和求职诉求】
${p}

要求：直接输出一句能发给 HR 的招呼语，像真人聊天开场那样自然。不要写成书信，不要「尊敬的」之类抬头，不要署名，2~4 句以内，可以结合岗位信息但别太生硬。`,
    },
    { role: 'user', content: JOB_BLOCK_GREETING },
  ]
}
