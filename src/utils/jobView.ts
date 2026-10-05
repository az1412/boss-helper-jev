import type { TaskResult } from '../composables/useApplying/type'
import type { JobData } from '../composables/useHelper/type'
import type { Statistics } from '../types/formData'

export type JobViewStatus = 'pending' | 'running' | 'success' | 'skipped' | 'error'
export type JobViewFilter = 'all' | JobViewStatus
export type JobViewResult = TaskResult & { deliveryConfirmed?: boolean }

export const jobViewLabels: Record<JobViewFilter, string> = {
  all: '全部',
  running: '处理中',
  pending: '待处理',
  success: '已发送',
  skipped: '已跳过',
  error: '异常',
}

export function getJobViewStatus(result?: JobViewResult): JobViewStatus {
  if (result?.deliveryConfirmed || result?.status === 'success') return 'success'
  if (result?.status === 'warn') return 'skipped'
  if (result?.status === 'error') return 'error'
  if (['running', 'request', 'ai'].includes(result?.status ?? '')) return 'running'
  return 'pending'
}

export function getJobReason(result?: JobViewResult): string {
  return [...new Set([result?.msg?.trim(), result?.reason?.trim()].filter(Boolean))].join('\n')
}

/** 只构造视图副本；不排序、不改结果、不修改执行队列。 */
export function filterJobView(
  jobs: readonly JobData[],
  results: ReadonlyMap<string, JobViewResult>,
  status: JobViewFilter = 'all',
  keyword = '',
): JobData[] {
  const seen = new Set<string>()
  const query = keyword.trim().toLocaleLowerCase()
  return jobs.filter((job) => {
    if (seen.has(job.key)) return false
    seen.add(job.key)
    return (
      (status === 'all' || getJobViewStatus(results.get(job.key)) === status) &&
      (!query || `${job.jobName}\n${job.brand.name}`.toLocaleLowerCase().includes(query))
    )
  })
}

/** 返回要转成横移的垂直滚轮量，0 表示让浏览器处理（含边界透传）。 */
export function horizontalWheelDelta(input: {
  deltaX: number
  deltaY: number
  deltaMode: number
  ctrlKey: boolean
  innerVertical: boolean
  scrollLeft: number
  scrollWidth: number
  clientWidth: number
}): number {
  if (input.ctrlKey || input.deltaX !== 0 || input.innerVertical) return 0
  const max = Math.max(0, input.scrollWidth - input.clientWidth)
  const scale = input.deltaMode === 1 ? 16 : input.deltaMode === 2 ? input.clientWidth : 1
  const delta = input.deltaY * scale
  if ((delta < 0 && input.scrollLeft <= 1) || (delta > 0 && input.scrollLeft >= max - 1)) {
    return 0
  }
  return Math.max(-input.scrollLeft, Math.min(max - input.scrollLeft, delta))
}

export function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** 按本地自然日筛选；同日只取一份快照，当前快照优先，缺失日期不补零。 */
export function statisticsForDays(
  history: readonly Statistics[],
  current: Statistics,
  days: number | null,
  now = new Date(),
): Statistics[] {
  const end = localDateKey(now)
  const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (days !== null) startDate.setDate(startDate.getDate() - Math.max(1, days) + 1)
  const start = days === null ? '' : localDateKey(startDate)
  const dates = new Set<string>()
  return [current, ...history]
    .filter((row) => {
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(row.date)
      if (!match) return false
      const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
      if (
        localDateKey(date) !== row.date ||
        row.date < start ||
        row.date > end ||
        dates.has(row.date)
      ) {
        return false
      }
      dates.add(row.date)
      return true
    })
    .sort((a, b) => b.date.localeCompare(a.date))
}
