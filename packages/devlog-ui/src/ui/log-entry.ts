/**
 * Log Entry Renderer
 *
 * Renders a single log entry with:
 * - Level badge (color-coded)
 * - Timestamp
 * - Source location
 * - Message
 * - Expandable data
 */

import type { LogEvent, DiffEntry, DiffResult } from '../core/types'

/**
 * Format timestamp for display (HH:MM:SS.mmm)
 */
function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  const seconds = date.getSeconds().toString().padStart(2, '0')
  const ms = date.getMilliseconds().toString().padStart(3, '0')
  return `${hours}:${minutes}:${seconds}.${ms}`
}

/**
 * Format source location for display
 */
function formatSource(source: LogEvent['source']): string {
  if (source.file === 'unknown') {
    return 'unknown'
  }
  return `${source.file}:${source.line}`
}

/**
 * Check if data item is a diff result
 */
function isDiffData(
  item: unknown,
): item is { __type: 'Diff'; diff: DiffResult; oldObj: unknown; newObj: unknown } {
  return (
    item !== null &&
    typeof item === 'object' &&
    (item as Record<string, unknown>).__type === 'Diff' &&
    (item as Record<string, unknown>).diff !== undefined
  )
}

/**
 * Format a value for diff display
 */
function formatDiffValue(value: unknown): string {
  if (value === undefined) return 'undefined'
  if (value === null) return 'null'
  if (typeof value === 'string') return `"${value}"`
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    if (value.length <= 3) return `[${value.map(formatDiffValue).join(', ')}]`
    return `[${value.length} items]`
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value)
    if (keys.length === 0) return '{}'
    if (keys.length <= 2) {
      return `{${keys.map((k) => `${k}: ${formatDiffValue((value as Record<string, unknown>)[k])}`).join(', ')}}`
    }
    return `{${keys.length} keys}`
  }
  return String(value)
}

/**
 * Format diff entry for display
 */
function formatDiffEntry(entry: DiffEntry): string {
  const typeClass = `diff-${entry.type}`
  const icon =
    entry.type === 'added'
      ? '+'
      : entry.type === 'removed'
        ? '-'
        : entry.type === 'changed'
          ? '~'
          : ' '

  let valueStr = ''
  if (entry.type === 'added') {
    valueStr = formatDiffValue(entry.newValue)
  } else if (entry.type === 'removed') {
    valueStr = formatDiffValue(entry.oldValue)
  } else if (entry.type === 'changed') {
    valueStr = `${formatDiffValue(entry.oldValue)} → ${formatDiffValue(entry.newValue)}`
  }

  return `<div class="diff-entry ${typeClass}"><span class="diff-icon">${icon}</span> <span class="diff-path">${entry.path}</span>: <span class="diff-value">${valueStr}</span></div>`
}

/**
 * Format diff result for display
 */
function formatDiff(diffData: {
  __type: 'Diff'
  diff: DiffResult
  oldObj: unknown
  newObj: unknown
}): string {
  const { diff } = diffData
  const { summary, changes } = diff

  let html = '<div class="diff-container">'

  // Summary
  html += '<div class="diff-summary">'
  if (summary.added > 0) html += `<span class="diff-count diff-added">+${summary.added}</span>`
  if (summary.removed > 0)
    html += `<span class="diff-count diff-removed">-${summary.removed}</span>`
  if (summary.changed > 0)
    html += `<span class="diff-count diff-changed">~${summary.changed}</span>`
  if (summary.added === 0 && summary.removed === 0 && summary.changed === 0) {
    html += '<span class="diff-count diff-unchanged">No changes</span>'
  }
  html += '</div>'

  // Changes
  if (changes.length > 0) {
    html += '<div class="diff-changes">'
    for (const entry of changes) {
      html += formatDiffEntry(entry)
    }
    html += '</div>'
  }

  html += '</div>'
  return html
}

/**
 * Safely stringify data for display
 */
function formatData(data: unknown[]): string {
  if (data.length === 0) {
    return ''
  }

  try {
    return data
      .map((item) => {
        if (typeof item === 'string') {
          return item
        }
        return JSON.stringify(item, null, 2)
      })
      .join('\n')
  } catch {
    return '[Unable to display data]'
  }
}

/**
 * Check if data contains a diff
 */
function containsDiff(data: unknown[]): boolean {
  return data.some(isDiffData)
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(str: string): string {
  const div = document.createElement('div')
  div.textContent = str
  return div.innerHTML
}

/**
 * Format context tags for display
 */
function formatContext(context: Record<string, string | number | boolean> | undefined): string {
  if (!context || Object.keys(context).length === 0) {
    return ''
  }
  return Object.entries(context)
    .map(([k, v]) => `${k}=${v}`)
    .join(' · ')
}

/**
 * Create a log entry DOM element
 */
export function createLogEntry(log: LogEvent): HTMLElement {
  const entry = document.createElement('div')
  entry.className = `log-entry${log.spanId ? ' log-entry-in-span' : ''}`
  entry.dataset.id = log.id
  if (log.spanId) {
    entry.dataset.spanId = log.spanId
  }

  const hasData = log.data.length > 0
  const hasDiff = containsDiff(log.data)
  const hasContext = log.context && Object.keys(log.context).length > 0
  const dataId = `data-${log.id}`

  // Render diff data specially
  const renderData = (): string => {
    if (!hasData) return ''

    if (hasDiff) {
      const diffItem = log.data.find(isDiffData)
      if (diffItem) {
        return `
          <div class="log-data log-data-diff">
            <button class="log-data-toggle" data-target="${dataId}">
              diff
            </button>
            <div class="log-data-content" id="${dataId}">${formatDiff(diffItem)}</div>
          </div>
        `
      }
    }

    return `
      <div class="log-data">
        <button class="log-data-toggle" data-target="${dataId}">
          ${log.data.length} item${log.data.length > 1 ? 's' : ''}
        </button>
        <pre class="log-data-content" id="${dataId}">${escapeHtml(formatData(log.data))}</pre>
      </div>
    `
  }

  entry.innerHTML = `
    <div class="log-entry-header">
      <span class="log-level log-level-${log.level}">${log.level}</span>
      <span class="log-time">${formatTime(log.timestamp)}</span>
      ${hasContext ? `<span class="log-context">${escapeHtml(formatContext(log.context))}</span>` : ''}
      <span class="log-source" title="${escapeHtml(formatSource(log.source))}">${escapeHtml(formatSource(log.source))}</span>
    </div>
    <div class="log-message">${escapeHtml(log.message)}</div>
    ${renderData()}
  `

  // Add click handler for data toggle
  if (hasData) {
    const toggle = entry.querySelector('.log-data-toggle')
    const content = entry.querySelector(`#${dataId}`)

    if (toggle && content) {
      toggle.addEventListener('click', () => {
        toggle.classList.toggle('expanded')
        content.classList.toggle('visible')
      })
    }
  }

  return entry
}

/**
 * Create the empty state element
 */
export function createEmptyState(): HTMLElement {
  const empty = document.createElement('div')
  empty.className = 'devlogger-empty'
  empty.textContent = 'No logs yet...'
  return empty
}
