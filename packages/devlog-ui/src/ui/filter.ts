/**
 * Filter System for DevLogger
 *
 * Key principle: Logs remain complete, UI decides visibility.
 * No data loss through filtering.
 */

import type { LogEvent, LogLevel } from '../core/types';

/**
 * Filter state interface
 */
export interface FilterState {
  /** Active log levels (empty = all) */
  levels: Set<LogLevel>;
  /** Text search query */
  search: string;
  /** File filter (partial match) */
  file: string;
}

/**
 * Create default filter state (show all)
 */
export function createDefaultFilterState(): FilterState {
  return {
    levels: new Set(['debug', 'info', 'warn', 'error']),
    search: '',
    file: '',
  };
}

/**
 * Check if a log matches the current filter
 */
export function matchesFilter(log: LogEvent, filter: FilterState): boolean {
  // Level filter
  if (filter.levels.size > 0 && !filter.levels.has(log.level)) {
    return false;
  }

  // File filter
  if (filter.file && !log.source.file.toLowerCase().includes(filter.file.toLowerCase())) {
    return false;
  }

  // Text search (searches message and data)
  if (filter.search) {
    const searchLower = filter.search.toLowerCase();
    const messageMatch = log.message.toLowerCase().includes(searchLower);
    const dataMatch = JSON.stringify(log.data).toLowerCase().includes(searchLower);

    if (!messageMatch && !dataMatch) {
      return false;
    }
  }

  return true;
}

/**
 * Filter logs based on current filter state
 */
export function filterLogs(logs: readonly LogEvent[], filter: FilterState): LogEvent[] {
  return logs.filter((log) => matchesFilter(log, filter));
}

/**
 * Check if any filter is active
 */
export function isFilterActive(filter: FilterState): boolean {
  const allLevels = filter.levels.size === 4; // All 4 levels selected
  return !allLevels || filter.search !== '' || filter.file !== '';
}

/**
 * Get unique files from logs
 */
export function getUniqueFiles(logs: readonly LogEvent[]): string[] {
  const files = new Set<string>();
  for (const log of logs) {
    if (log.source.file && log.source.file !== 'unknown') {
      files.add(log.source.file);
    }
  }
  return Array.from(files).sort();
}

/**
 * Create filter bar HTML
 */
export function createFilterBarHtml(filter: FilterState, logCount: number, filteredCount: number): string {
  const isActive = isFilterActive(filter);

  return `
    <div class="filter-bar ${isActive ? 'filter-active' : ''}">
      <div class="filter-row">
        <div class="filter-levels">
          <button class="filter-level-btn ${filter.levels.has('debug') ? 'active' : ''}" data-level="debug" title="Debug">D</button>
          <button class="filter-level-btn ${filter.levels.has('info') ? 'active' : ''}" data-level="info" title="Info">I</button>
          <button class="filter-level-btn ${filter.levels.has('warn') ? 'active' : ''}" data-level="warn" title="Warning">W</button>
          <button class="filter-level-btn ${filter.levels.has('error') ? 'active' : ''}" data-level="error" title="Error">E</button>
        </div>
        <div class="filter-search">
          <input type="text" class="filter-input" placeholder="Search logs..." value="${escapeHtml(filter.search)}" data-filter="search">
        </div>
        <div class="filter-file">
          <input type="text" class="filter-input filter-file-input" placeholder="Filter by file..." value="${escapeHtml(filter.file)}" data-filter="file">
        </div>
        ${isActive ? `<button class="filter-clear-btn" title="Clear filters">✕</button>` : ''}
      </div>
      ${isActive ? `<div class="filter-status">Showing ${filteredCount} of ${logCount} logs</div>` : ''}
    </div>
  `;
}

/**
 * Escape HTML for safe insertion
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
