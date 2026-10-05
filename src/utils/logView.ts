import type { LogEvent, LogLevel } from 'devlog-ui'

import { redactLogValue, redactText } from '../../packages/devlog-ui/src/core/redaction'

export type LogCategory = 'success' | 'skipped' | 'error' | 'run'
export type LogScope = 'current' | 'all'
export const MAX_LOG_PAGE_SIZE = 200
export const LOG_CATEGORY_LABELS: Record<LogCategory, string> = {
  success: '成功',
  skipped: '跳过',
  error: '异常',
  run: '运行消息',
}

export function resolveLogLevel(value: unknown): LogLevel {
  return value === 'debug' || value === 'info' || value === 'warn' || value === 'error'
    ? value
    : 'info'
}

export function classifyLog(log: LogEvent): LogCategory {
  switch (log.context?.event) {
    case 'success':
      return 'success'
    case 'skipped':
      return 'skipped'
    case 'error':
      return 'error'
    case 'run':
    case 'message':
      return 'run'
  }
  // 旧版为显示成功/过滤而借用了 warn，业务文案优先于日志等级。
  if (/^(?:投递成功|打招呼成功|默认招呼已发送)(?:\s*[:：]|\s*$)/.test(log.message)) return 'success'
  if (/^(?:投递过滤|筛选跳过|岗位已跳过|Jev.*跳过)(?:\s*[:：]|\s*$)/i.test(log.message))
    return 'skipped'
  if (log.level === 'error' || /失败|错误|异常|待核实/.test(log.message)) return 'error'
  return 'run'
}

export interface BusinessLog {
  id: string
  timestamp: number
  category: LogCategory
  message: string
  reason: string
  runId?: string
  jobKey?: string
  jobName?: string
  log: LogEvent
}

function contextText(log: LogEvent, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = log.context?.[key]
    if (typeof value === 'string' || typeof value === 'number') return String(value)
  }
}

export function toBusinessLog(event: LogEvent): BusinessLog {
  const log = redactLogValue(event) as LogEvent
  const category = classifyLog(log)
  const reasons: string[] = []
  // 发送正文、配置与简历只在用户主动展开原始数据后显示，不拿来当一行摘要。
  const privatePayload = /(?:消息内容|发送内容|发送消息|自定义消息|简历内容|配置)/.test(log.message)
  if (!privatePayload) {
    for (const data of log.data ?? []) {
      if (typeof data === 'string' && !/^\s*[[{]/.test(data)) reasons.push(data)
      else if (data && typeof data === 'object') {
        const object = data as Record<string, unknown>
        if (typeof object.reason === 'string') reasons.push(object.reason)
        else if (category === 'error' && typeof object.message === 'string')
          reasons.push(object.message)
      }
    }
  }
  return {
    id: log.id,
    timestamp: log.timestamp,
    category,
    message: log.message,
    reason: reasons.join('；') || log.message,
    runId: contextText(log, 'runId', 'run_id'),
    jobKey: contextText(log, 'job_key', 'jobKey'),
    jobName: contextText(log, 'job_name', 'jobName'),
    log,
  }
}

/** With no live run prop, use the latest explicitly tagged run, not the browser session. */
export function latestLogRunId(logs: readonly BusinessLog[]): string | undefined {
  for (let index = logs.length - 1; index >= 0; index--) {
    if (logs[index]?.runId) return logs[index].runId
  }
}

export function filterBusinessLogs(
  logs: readonly BusinessLog[],
  options: {
    scope: LogScope
    runId?: string
    category: LogCategory | 'all'
    search?: string
  },
): BusinessLog[] {
  const search = options.search?.trim().toLocaleLowerCase()
  return logs.filter((log) => {
    if (options.scope === 'current' && (!options.runId || log.runId !== options.runId)) return false
    if (options.category !== 'all' && log.category !== options.category) return false
    return (
      !search ||
      [log.message, log.reason, log.jobName, log.jobKey, log.runId].some((value) =>
        value?.toLocaleLowerCase().includes(search),
      )
    )
  })
}

export function paginateLogs<T>(logs: readonly T[], page: number, pageSize = 50) {
  const size = Math.min(MAX_LOG_PAGE_SIZE, Math.max(1, Math.floor(pageSize) || 50))
  const totalPages = Math.max(1, Math.ceil(logs.length / size))
  const currentPage = Math.max(1, Math.min(totalPages, Math.floor(page) || 1))
  return {
    items: logs.slice((currentPage - 1) * size, currentPage * size),
    page: currentPage,
    totalPages,
    size,
  }
}

export function copyLogReason(log: BusinessLog): string {
  return redactText(
    [log.jobName, log.message, log.reason !== log.message ? log.reason : undefined]
      .filter(Boolean)
      .join('\n'),
  )
}

/** Selection uses the existing export API; this never serializes raw UI objects. */
export function exportBusinessLogs(
  exporter: { exportLogs: (options: { format: 'json'; ids?: readonly string[] }) => string },
  selection?: readonly BusinessLog[],
): string {
  return exporter.exportLogs({
    format: 'json',
    ...(selection ? { ids: selection.map((log) => log.id) } : {}),
  })
}
