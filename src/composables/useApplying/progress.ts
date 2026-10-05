import type { TaskResult } from './type'

export type ResultCategory = 'pending' | 'running' | 'success' | 'skipped' | 'error'

export function resultCategory(result?: TaskResult): ResultCategory {
  if (result?.status === 'success' || result?.deliveryConfirmed) return 'success'
  if (result?.status === 'warn') return 'skipped'
  if (result?.status === 'error') return 'error'
  if (['running', 'request', 'ai'].includes(result?.status ?? '')) return 'running'
  return 'pending'
}

export function summarizeResults(keys: Iterable<string>, results: Map<string, TaskResult>) {
  const summary = { total: 0, pending: 0, running: 0, success: 0, skipped: 0, error: 0 }
  for (const key of new Set(keys)) {
    summary.total++
    summary[resultCategory(results.get(key))]++
  }
  return summary
}

export function isFinalResult(result?: TaskResult) {
  return (
    !!result &&
    (['success', 'warn'].includes(result.status ?? '') ||
      result.deliveryUncertain ||
      result.deliveryConfirmed)
  )
}

export function unseenJobs<T extends { key: string }>(jobs: T[], seen: Set<string>): T[] {
  const unique = new Map(jobs.map((job) => [job.key, job]))
  return [...unique.values()].filter((job) => !seen.has(job.key))
}
