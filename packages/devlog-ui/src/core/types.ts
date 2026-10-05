/**
 * Core type definitions for DevLogger
 *
 * These types define the contract for all logging operations.
 * They are stable and should not change without major version bump.
 */

/**
 * Available log levels in order of severity
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Source location of a log entry
 */
export interface Source {
  /** File path or name */
  file: string;
  /** Line number (1-based) */
  line: number;
  /** Column number (1-based, optional) */
  column?: number;
  /** Function or method name (optional) */
  function?: string;
}

/**
 * Context/tags for log correlation
 */
export type LogContext = Record<string, string | number | boolean>;

/**
 * Span status for grouped logs
 */
export type SpanStatus = 'running' | 'success' | 'error';

/**
 * A single log event with all metadata
 */
export interface LogEvent {
  /** Unique identifier for this log entry */
  id: string;
  /** Unix timestamp in milliseconds */
  timestamp: number;
  /** Log severity level */
  level: LogLevel;
  /** Primary log message */
  message: string;
  /** Additional data passed to the log call */
  data: unknown[];
  /** Source code location */
  source: Source;
  /** Browser session identifier */
  sessionId: string;
  /** Optional context/tags for filtering */
  context?: LogContext;
  /** Span ID if this log belongs to a span */
  spanId?: string;
}

/**
 * A span (grouped logs) event
 */
export interface SpanEvent {
  /** Unique span identifier */
  id: string;
  /** Span name/label */
  name: string;
  /** Start timestamp */
  startTime: number;
  /** End timestamp (set when span ends) */
  endTime?: number;
  /** Duration in milliseconds */
  duration?: number;
  /** Current status */
  status: SpanStatus;
  /** Parent span ID for nesting */
  parentId?: string;
  /** Context inherited by all logs in this span */
  context?: LogContext;
  /** Source where span was created */
  source: Source;
  /** Session ID */
  sessionId: string;
}

/**
 * Logger configuration options
 */
export interface LoggerConfig {
  /** Maximum number of logs to keep in memory (default: 1000) */
  maxLogs?: number;
  /** Persist logs to sessionStorage (default: false) */
  persist?: boolean;
  /** Minimum log level to capture (default: 'debug') */
  minLevel?: LogLevel;
  /** Enable/disable logging entirely (default: true) */
  enabled?: boolean;
  /** Ctrl+Shift+L action: toggle overlay or open pop-out (default: 'toggle') */
  shortcutAction?: 'toggle' | 'popout';
  /** Show the floating toggle button in the UI (default: true) */
  showToggleButton?: boolean;
  /** Collapse span groups by default in the UI (default: false) */
  spanCollapsed?: boolean;
}

/**
 * Subscriber callback for new log events
 */
export type LogSubscriber = (event: LogEvent) => void;

/**
 * Subscriber callback for span events
 */
export type SpanSubscriber = (event: SpanEvent) => void;

/**
 * Function to unsubscribe from log events
 */
export type Unsubscribe = () => void;

/**
 * Log level numeric values for comparison
 */
export const LOG_LEVEL_VALUES: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Diff change type
 */
export type DiffChangeType = 'added' | 'removed' | 'changed' | 'unchanged';

/**
 * A single diff entry for object comparison
 */
export interface DiffEntry {
  /** Path to the property (e.g., "user.profile.name") */
  path: string;
  /** Type of change */
  type: DiffChangeType;
  /** Old value (for removed/changed) */
  oldValue?: unknown;
  /** New value (for added/changed) */
  newValue?: unknown;
}

/**
 * Diff result for object comparison
 */
export interface DiffResult {
  /** All changes found */
  changes: DiffEntry[];
  /** Summary counts */
  summary: {
    added: number;
    removed: number;
    changed: number;
    unchanged: number;
  };
}
