/**
 * Core Logger - Phase 1 Implementation
 *
 * Single Source of Truth for all logging operations.
 * UI-agnostic, crash-resistant, zero external dependencies.
 */

import type {
  LogEvent,
  LogLevel,
  LoggerConfig,
  LogSubscriber,
  SpanSubscriber,
  Unsubscribe,
  Source,
  LogContext,
  SpanEvent,
  SpanStatus,
  DiffResult,
} from './types';
import { LOG_LEVEL_VALUES } from './types';
import { createDiffResult } from './diff';
import { redactLogValue, redactText } from './redaction';

/**
 * Export format options
 */
export interface ExportOptions {
  /** Export format: 'json' or 'text' */
  format?: 'json' | 'text';
  /** Include only logs from the last N milliseconds */
  lastMs?: number;
  /** Include only logs matching these levels */
  levels?: LogLevel[];
  /** Include only logs matching this search */
  search?: string;
  /** Pretty print JSON (default: true) */
  pretty?: boolean;
  /** Export an exact business-view selection; an empty list exports no logs. */
  ids?: readonly string[];
}

/**
 * Check environment variables to determine if logger should be enabled
 * Supports various build tools: Vite, Webpack/CRA, generic
 */
function checkEnvEnabled(): boolean {
  try {
    // Check for explicit disable flag (highest priority)
    // Vite: import.meta.env.VITE_DEVLOGGER_ENABLED
    // CRA/Webpack: process.env.REACT_APP_DEVLOGGER_ENABLED
    // Generic: process.env.DEVLOGGER_ENABLED

    // @ts-expect-error - Vite env
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      // @ts-expect-error - Vite env
      const viteEnabled = import.meta.env.VITE_DEVLOGGER_ENABLED;
      if (viteEnabled === 'false' || viteEnabled === '0') return false;
      if (viteEnabled === 'true' || viteEnabled === '1') return true;

      // Check Vite mode
      // @ts-expect-error - Vite env
      if (import.meta.env.PROD === true) return false;
      // @ts-expect-error - Vite env
      if (import.meta.env.DEV === true) return true;
    }

    // Check process.env (Node.js / Webpack / CRA)
    // Use globalThis to avoid TypeScript errors
    const proc = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process;
    if (proc?.env) {
      // Explicit flag
      const envEnabled = proc.env.DEVLOGGER_ENABLED || proc.env.REACT_APP_DEVLOGGER_ENABLED;
      if (envEnabled === 'false' || envEnabled === '0') return false;
      if (envEnabled === 'true' || envEnabled === '1') return true;

      // NODE_ENV check
      if (proc.env.NODE_ENV === 'production') return false;
    }

    // Default: enabled (for development)
    return true;
  } catch {
    // If env check fails, default to enabled
    return true;
  }
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Required<LoggerConfig> = {
  maxLogs: 1000,
  persist: false,
  minLevel: 'debug',
  enabled: checkEnvEnabled(),
  shortcutAction: 'toggle',
  showToggleButton: true,
  spanCollapsed: false,
};

/**
 * Generate a unique session ID for this browser session
 */
function generateSessionId(): string {
  // Check for existing session ID in sessionStorage
  const STORAGE_KEY = 'devlogger_session_id';
  try {
    const existing = sessionStorage.getItem(STORAGE_KEY);
    if (existing) {
      return existing;
    }
    const newId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    sessionStorage.setItem(STORAGE_KEY, newId);
    return newId;
  } catch {
    // sessionStorage not available, generate ephemeral ID
    return `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }
}

/**
 * Generate a unique log ID
 */
function generateLogId(): string {
  return `log_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Capture source location from stack trace
 * (Basic implementation - will be enhanced in Phase 2)
 */
function captureSource(): Source {
  try {
    const stack = new Error().stack;
    if (!stack) {
      return { file: 'unknown', line: 0 };
    }

    const lines = stack.split('\n');
    // Find the first stack frame that's not from this file
    // Skip: Error, captureSource, log, info/warn/error/debug
    for (let i = 4; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;

      // Skip internal logger frames
      if (line.includes('logger.ts') || line.includes('logger.js')) {
        continue;
      }

      // Parse stack frame - handles various formats:
      // Chrome/Edge: "    at functionName (file:line:col)"
      // Firefox: "functionName@file:line:col"
      // Safari: "functionName@file:line:col"

      // Try Chrome/Edge format first
      const chromeMatch = line.match(/at\s+(?:(.+?)\s+)?\(?(.+?):(\d+):(\d+)\)?/);
      if (chromeMatch) {
        return {
          function: chromeMatch[1] || undefined,
          file: cleanFilePath(chromeMatch[2] || 'unknown'),
          line: parseInt(chromeMatch[3] || '0', 10),
          column: parseInt(chromeMatch[4] || '0', 10),
        };
      }

      // Try Firefox/Safari format
      const firefoxMatch = line.match(/(.+)?@(.+?):(\d+):(\d+)/);
      if (firefoxMatch) {
        return {
          function: firefoxMatch[1] || undefined,
          file: cleanFilePath(firefoxMatch[2] || 'unknown'),
          line: parseInt(firefoxMatch[3] || '0', 10),
          column: parseInt(firefoxMatch[4] || '0', 10),
        };
      }
    }

    return { file: 'unknown', line: 0 };
  } catch {
    return { file: 'unknown', line: 0 };
  }
}

/**
 * Clean up file path for display
 */
function cleanFilePath(path: string): string {
  // Remove webpack/vite internal prefixes
  let cleaned = path
    .replace(/^webpack:\/\/[^/]*\//, '')
    .replace(/^\/@fs/, '')
    .replace(/^file:\/\//, '')
    .replace(/\?.*$/, ''); // Remove query strings

  // Extract just the filename with one parent dir for context
  const parts = cleaned.split('/');
  if (parts.length > 2) {
    cleaned = parts.slice(-2).join('/');
  }

  return cleaned;
}

/**
 * Generate a unique span ID
 */
function generateSpanId(): string {
  return `span_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Log Span class - represents a grouped set of related logs
 */
class LogSpan {
  private logger: LoggerCore;
  private _event: SpanEvent;
  private _ended = false;

  constructor(
    logger: LoggerCore,
    name: string,
    context?: LogContext,
    parentId?: string
  ) {
    this.logger = logger;
    this._event = {
      id: generateSpanId(),
      name: redactText(name),
      startTime: Date.now(),
      status: 'running',
      parentId,
      context: redactLogValue(context) as LogContext | undefined,
      source: redactLogValue(captureSource()) as Source,
      sessionId: logger.getSessionId(),
    };
    logger['notifySpan'](this._event);
  }

  /** Get span ID */
  get id(): string {
    return this._event.id;
  }

  /** Get span event data */
  get event(): Readonly<SpanEvent> {
    return this._event;
  }

  /** Check if span has ended */
  get ended(): boolean {
    return this._ended;
  }

  /** Log debug within this span */
  debug(message: string, ...data: unknown[]): void {
    if (!this._ended) {
      this.logger['logWithSpan']('debug', message, data, this._event.id, this._event.context);
    }
  }

  /** Log info within this span */
  info(message: string, ...data: unknown[]): void {
    if (!this._ended) {
      this.logger['logWithSpan']('info', message, data, this._event.id, this._event.context);
    }
  }

  /** Log warn within this span */
  warn(message: string, ...data: unknown[]): void {
    if (!this._ended) {
      this.logger['logWithSpan']('warn', message, data, this._event.id, this._event.context);
    }
  }

  /** Log error within this span */
  error(message: string, ...data: unknown[]): void {
    if (!this._ended) {
      this.logger['logWithSpan']('error', message, data, this._event.id, this._event.context);
    }
  }

  /** Create a child span */
  span(name: string, context?: LogContext): LogSpan {
    const mergedContext = { ...this._event.context, ...context };
    return new LogSpan(this.logger, name, mergedContext, this._event.id);
  }

  /** End the span successfully */
  end(): void {
    this.finish('success');
  }

  /** End the span with error status */
  fail(error?: Error | string): void {
    if (error) {
      this.error(typeof error === 'string' ? error : error.message, error);
    }
    this.finish('error');
  }

  /** Internal finish method */
  private finish(status: SpanStatus): void {
    if (this._ended) return;
    this._ended = true;
    this._event.endTime = Date.now();
    this._event.duration = this._event.endTime - this._event.startTime;
    this._event.status = status;
    this.logger['notifySpan'](this._event);
  }
}

/**
 * Context-bound logger - logs with specific context attached
 */
class ContextLogger {
  private logger: LoggerCore;
  private context: LogContext;

  constructor(logger: LoggerCore, context: LogContext) {
    this.logger = logger;
    this.context = redactLogValue(context) as LogContext;
  }

  debug(message: string, ...data: unknown[]): void {
    this.logger['logWithContext']('debug', message, data, this.context);
  }

  info(message: string, ...data: unknown[]): void {
    this.logger['logWithContext']('info', message, data, this.context);
  }

  warn(message: string, ...data: unknown[]): void {
    this.logger['logWithContext']('warn', message, data, this.context);
  }

  error(message: string, ...data: unknown[]): void {
    this.logger['logWithContext']('error', message, data, this.context);
  }

  /** Create a span with this context */
  span(name: string, extraContext?: LogContext): LogSpan {
    return this.logger.span(name, { ...this.context, ...extraContext });
  }

  /** Create a new context logger with merged context */
  withContext(extraContext: LogContext): ContextLogger {
    return new ContextLogger(this.logger, { ...this.context, ...extraContext });
  }
}

/**
 * Core Logger Class
 *
 * Lifecycle of a log:
 * 1. Log is created (info/warn/error/debug called)
 * 2. Log is enriched (timestamp, source, sessionId added)
 * 3. Log is stored (in-memory, with rotation)
 * 4. Log is distributed (subscribers notified)
 * 5. Log is displayed (by UI subscribers)
 */
class LoggerCore {
  private logs: LogEvent[] = [];
  private spans: Map<string, SpanEvent> = new Map();
  private subscribers: Set<LogSubscriber> = new Set();
  private spanSubscribers: Set<SpanSubscriber> = new Set();
  private config: Required<LoggerConfig> = { ...DEFAULT_CONFIG };
  private sessionId: string;
  private globalContext: LogContext = {};

  constructor() {
    this.sessionId = generateSessionId();
  }

  /**
   * Core logging method - all public methods delegate to this
   */
  private log(level: LogLevel, message: string, data: unknown[], context?: LogContext, spanId?: string): void {
    // Zero-Throw Policy: wrap everything in try-catch
    try {
      // Check if logging is enabled
      if (!this.config.enabled) {
        return;
      }

      // Check minimum log level
      if (LOG_LEVEL_VALUES[level] < LOG_LEVEL_VALUES[this.config.minLevel]) {
        return;
      }

      // Merge global context with provided context
      const mergedContext = Object.keys(this.globalContext).length > 0 || context
        ? { ...this.globalContext, ...context }
        : undefined;

      // Step 1 & 2: Create and enrich log event
      const event: LogEvent = {
        id: generateLogId(),
        timestamp: Date.now(),
        level,
        message: this.safeClone(String(message)) as string,
        data: this.safeCloneData(data),
        source: redactLogValue(captureSource()) as Source,
        sessionId: this.sessionId,
        context: redactLogValue(mergedContext) as LogContext | undefined,
        spanId,
      };

      // Step 3: Store with rotation
      this.store(event);

      // Step 4: Distribute to subscribers
      this.notify(event);
    } catch (e) {
      // Silent fail - never throw from logger
      // Optionally log to console for debugging the debugger
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[DevLogger] Internal error:', redactLogValue(e));
      }
    }
  }

  /**
   * Log with context (used by ContextLogger)
   */
  private logWithContext(level: LogLevel, message: string, data: unknown[], context: LogContext): void {
    this.log(level, message, data, context);
  }

  /**
   * Log with span (used by LogSpan)
   */
  private logWithSpan(level: LogLevel, message: string, data: unknown[], spanId: string, context?: LogContext): void {
    this.log(level, message, data, context, spanId);
  }

  /**
   * Notify span subscribers
   */
  private notifySpan(span: SpanEvent): void {
    this.spans.set(span.id, span);
    for (const subscriber of this.spanSubscribers) {
      try {
        subscriber(span);
      } catch {
        // Don't let subscriber errors break logging
      }
    }
  }

  /**
   * Safely clone data to prevent mutations and handle special cases
   */
  private safeCloneData(data: unknown[]): unknown[] {
    return data.map((item) => this.safeClone(item));
  }

  /**
   * Deep clone with circular reference handling
   */
  private safeClone(value: unknown): unknown {
    return redactLogValue(value);
  }

  /**
   * Store log with FIFO rotation
   */
  private store(event: LogEvent): void {
    this.logs.push(event);

    // FIFO rotation - remove oldest logs if over limit
    while (this.logs.length > this.config.maxLogs) {
      this.logs.shift();
    }
  }

  /**
   * Notify all subscribers of new log
   */
  private notify(event: LogEvent): void {
    for (const subscriber of this.subscribers) {
      try {
        subscriber(event);
      } catch {
        // Don't let subscriber errors break logging
      }
    }
  }

  // ========== Public API ==========

  /**
   * Log an info message
   */
  info(message: string, ...data: unknown[]): void {
    this.log('info', message, data);
  }

  /**
   * Log a warning message
   */
  warn(message: string, ...data: unknown[]): void {
    this.log('warn', message, data);
  }

  /**
   * Log an error message
   */
  error(message: string, ...data: unknown[]): void {
    this.log('error', message, data);
  }

  /**
   * Log a debug message
   */
  debug(message: string, ...data: unknown[]): void {
    this.log('debug', message, data);
  }

  /**
   * Update logger configuration
   */
  configure(config: Partial<LoggerConfig>): void {
    try {
      const next = { ...this.config, ...config };
      // Runtime callers (including the technical UI) may supply an invalid string.
      if (!Object.prototype.hasOwnProperty.call(LOG_LEVEL_VALUES, next.minLevel)) {
        next.minLevel = this.config.minLevel;
      }
      this.config = next;
    } catch {
      // Silent fail
    }
  }

  /**
   * Clear all stored logs and spans
   */
  clear(): void {
    try {
      this.logs = [];
      this.spans.clear();
    } catch {
      // Silent fail
    }
  }

  /**
   * Import logs (used for rehydration from persistence)
   * Imported logs are added at the beginning, preserving order
   */
  importLogs(logs: LogEvent[]): void {
    try {
      if (!Array.isArray(logs) || logs.length === 0) {
        return;
      }

      // Filter out logs that already exist (by id)
      const existingIds = new Set(this.logs.map((l) => l.id));
      const newLogs = logs.filter((l) => l && !existingIds.has(l.id)).map((log) =>
        // Recovery is an ingress too. Do not mutate or clear the stored history.
        redactLogValue({ data: [], source: { file: 'unknown', line: 0 }, ...log }) as LogEvent
      );

      // Prepend imported logs
      this.logs = [...newLogs, ...this.logs];

      // Apply rotation
      while (this.logs.length > this.config.maxLogs) {
        this.logs.shift();
      }
    } catch {
      // Silent fail
    }
  }

  /**
   * Get all stored logs (readonly)
   */
  getLogs(): readonly LogEvent[] {
    // Persistence and UI consumers get sanitized snapshots, not writable store
    // references. Legacy/subscriber mutations must not reintroduce credentials.
    return this.logs.map(log => redactLogValue(log) as LogEvent);
  }

  /**
   * Subscribe to new log events
   */
  subscribe(fn: LogSubscriber): Unsubscribe {
    try {
      this.subscribers.add(fn);
      return () => {
        this.subscribers.delete(fn);
      };
    } catch {
      return () => {};
    }
  }

  /**
   * Get current session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Get current configuration
   */
  getConfig(): Readonly<Required<LoggerConfig>> {
    return { ...this.config };
  }

  /**
   * Check if logging is currently enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  // ========== Span API ==========

  /**
   * Create a new span for grouping related logs
   */
  span(name: string, context?: LogContext): LogSpan {
    try {
      return new LogSpan(this, name, context);
    } catch {
      // Return a no-op span on failure
      return new LogSpan(this, name, context);
    }
  }

  /**
   * Get all spans
   */
  getSpans(): readonly SpanEvent[] {
    return Array.from(this.spans.values());
  }

  /**
   * Get a specific span by ID
   */
  getSpan(spanId: string): SpanEvent | undefined {
    return this.spans.get(spanId);
  }

  /**
   * Get logs belonging to a specific span
   */
  getSpanLogs(spanId: string): readonly LogEvent[] {
    return this.logs.filter((log) => log.spanId === spanId);
  }

  /**
   * Subscribe to span events
   */
  subscribeSpans(fn: SpanSubscriber): Unsubscribe {
    try {
      this.spanSubscribers.add(fn);
      return () => {
        this.spanSubscribers.delete(fn);
      };
    } catch {
      return () => {};
    }
  }

  // ========== Context API ==========

  /**
   * Set global context that will be attached to all logs
   */
  setGlobalContext(context: LogContext): void {
    try {
      this.globalContext = redactLogValue(context) as LogContext;
    } catch {
      // Silent fail
    }
  }

  /**
   * Update global context (merge with existing)
   */
  updateGlobalContext(context: LogContext): void {
    try {
      this.globalContext = redactLogValue({ ...this.globalContext, ...context }) as LogContext;
    } catch {
      // Silent fail
    }
  }

  /**
   * Get current global context
   */
  getGlobalContext(): Readonly<LogContext> {
    return { ...this.globalContext };
  }

  /**
   * Clear global context
   */
  clearGlobalContext(): void {
    this.globalContext = {};
  }

  /**
   * Create a context-bound logger
   */
  withContext(context: LogContext): ContextLogger {
    return new ContextLogger(this, context);
  }

  // ========== Export API ==========

  /**
   * Export logs in specified format
   */
  exportLogs(options: ExportOptions = {}): string {
    try {
      const {
        format = 'json',
        lastMs,
        levels,
        search,
        pretty = true,
        ids,
      } = options;

      // Re-sanitize exports as defense in depth for legacy data or object mutation.
      let filteredLogs = this.logs.map(log => redactLogValue(log) as LogEvent);
      if (ids !== undefined) {
        const selectedIds = new Set(ids);
        filteredLogs = filteredLogs.filter(log => selectedIds.has(log.id));
      }

      // Filter by time
      if (lastMs !== undefined && lastMs > 0) {
        const cutoff = Date.now() - lastMs;
        filteredLogs = filteredLogs.filter((log) => log.timestamp >= cutoff);
      }

      // Filter by levels
      if (levels && levels.length > 0) {
        const levelSet = new Set(levels);
        filteredLogs = filteredLogs.filter((log) => levelSet.has(log.level));
      }

      // Filter by search
      if (search) {
        const searchLower = search.toLowerCase();
        filteredLogs = filteredLogs.filter(
          (log) =>
            log.message.toLowerCase().includes(searchLower) ||
            JSON.stringify(log.data).toLowerCase().includes(searchLower)
        );
      }

      if (format === 'text') {
        return this.formatLogsAsText(filteredLogs);
      }

      return pretty
        ? JSON.stringify(filteredLogs, null, 2)
        : JSON.stringify(filteredLogs);
    } catch {
      return '[]';
    }
  }

  /**
   * Format logs as human-readable text
   */
  private formatLogsAsText(logs: LogEvent[]): string {
    return logs
      .map((log) => {
        const time = new Date(log.timestamp).toISOString();
        const level = log.level.toUpperCase().padEnd(5);
        const source = `${log.source.file}:${log.source.line}`;
        const context = log.context ? ` [${Object.entries(log.context).map(([k, v]) => `${k}=${v}`).join(', ')}]` : '';
        const span = log.spanId ? ` (span: ${log.spanId})` : '';
        const data = log.data.length > 0 ? `\n  Data: ${JSON.stringify(log.data)}` : '';
        return `[${time}] ${level} ${log.message}${context}${span}\n  Source: ${source}${data}`;
      })
      .join('\n\n');
  }

  /**
   * Copy logs to clipboard
   */
  async copyLogs(options: ExportOptions = {}): Promise<boolean> {
    try {
      const exported = this.exportLogs(options);
      await navigator.clipboard.writeText(exported);
      return true;
    } catch {
      return false;
    }
  }

  // ========== Diff API ==========

  /**
   * Log a visual diff between two objects
   */
  diff(message: string, oldObj: unknown, newObj: unknown, level: LogLevel = 'info'): DiffResult {
    try {
      const diffResult = createDiffResult(this.safeClone(oldObj), this.safeClone(newObj));

      // Log with the diff data attached
      this.log(level, message, [
        {
          __type: 'Diff',
          diff: diffResult,
          oldObj: this.safeClone(oldObj),
          newObj: this.safeClone(newObj),
        },
      ]);

      return diffResult;
    } catch {
      // Return empty diff on error
      return {
        changes: [],
        summary: { added: 0, removed: 0, changed: 0, unchanged: 0 },
      };
    }
  }

  /**
   * Compute diff without logging (utility method)
   */
  computeDiff(oldObj: unknown, newObj: unknown): DiffResult {
    try {
      return createDiffResult(oldObj, newObj);
    } catch {
      return {
        changes: [],
        summary: { added: 0, removed: 0, changed: 0, unchanged: 0 },
      };
    }
  }
}

// Singleton export
export const logger = new LoggerCore();

// Export LogSpan type for external use
export type { LogSpan, ContextLogger };
