/**
 * DevLogger - Browser-based Dev Logger with UI
 *
 * A lightweight, framework-agnostic dev logger with a beautiful debug UI.
 * Zero dependencies, zero production overhead (via tree-shaking).
 *
 * @example
 * ```typescript
 * import { logger, DevLoggerUI } from 'devlogger';
 *
 * DevLoggerUI.init();
 * logger.info('App started');
 * logger.debug('Config loaded', { theme: 'dark' });
 * ```
 *
 * @packageDocumentation
 */

// ============================================================================
// Core Logger API
// ============================================================================

/**
 * The logger singleton instance.
 *
 * @example
 * ```typescript
 * logger.info('User logged in', { userId: 123 });
 * logger.warn('Cache miss');
 * logger.error('API failed', new Error('Timeout'));
 * logger.debug('Rendering component', props);
 *
 * // With context
 * logger.withContext({ requestId: '123' }).info('Request started');
 *
 * // With spans
 * const span = logger.span('Load user');
 * span.info('Fetching...');
 * span.end();
 * ```
 */
export { logger } from './core/logger';

/**
 * Export options for log export functionality.
 */
export type { ExportOptions, LogSpan, ContextLogger } from './core/logger';

/**
 * Core type definitions for log events and configuration.
 */
export type {
  /** A single log event with all metadata */
  LogEvent,
  /** Log severity level: 'debug' | 'info' | 'warn' | 'error' */
  LogLevel,
  /** Logger configuration options */
  LoggerConfig,
  /** Source code location (file, line, column, function) */
  Source,
  /** Callback function for log subscriptions */
  LogSubscriber,
  /** Callback function for span events */
  SpanSubscriber,
  /** Function to unsubscribe from log events */
  Unsubscribe,
  /** Context/tags for log correlation */
  LogContext,
  /** Span event data */
  SpanEvent,
  /** Span status: 'running' | 'success' | 'error' */
  SpanStatus,
} from './core/types';

// ============================================================================
// Debug UI API
// ============================================================================

/**
 * The DevLogger UI overlay controller.
 *
 * @example
 * ```typescript
 * // Initialize at app start
 * DevLoggerUI.init();
 *
 * // Toggle with code or Ctrl+Shift+L
 * DevLoggerUI.toggle();
 *
 * // Open in separate window
 * DevLoggerUI.popout();
 * ```
 */
export { DevLoggerUI } from './ui/overlay';

/**
 * Filter state type for programmatic filter control.
 */
export type { FilterState } from './ui/filter';

// ============================================================================
// Error Capture API
// ============================================================================

/**
 * Global error capture for uncaught errors and unhandled rejections.
 *
 * @example
 * ```typescript
 * // Install at app start to auto-capture errors
 * ErrorCapture.install();
 *
 * // Later, uninstall if needed
 * ErrorCapture.uninstall();
 * ```
 */
export { ErrorCapture } from './core/error-capture';

/**
 * Configuration type for error capture.
 */
export type { ErrorCaptureConfig } from './core/error-capture';

// ============================================================================
// Persistence API
// ============================================================================

/**
 * Log persistence for crash recovery.
 *
 * @example
 * ```typescript
 * // Enable persistence at app start
 * LogPersistence.enable();
 *
 * // Rehydrate logs from previous session
 * const count = LogPersistence.rehydrate();
 * if (LogPersistence.hadCrash()) {
 *   logger.warn(`Recovered ${count} logs from crash`);
 * }
 * ```
 */
export { LogPersistence } from './core/persistence';

/**
 * Configuration type for log persistence.
 */
export type { PersistenceConfig } from './core/persistence';

// ============================================================================
// Network Capture API
// ============================================================================

/**
 * Network capture for automatic request/response tracking.
 *
 * @example
 * ```typescript
 * // Install at app start to auto-capture network requests
 * NetworkCapture.install();
 *
 * // With configuration
 * NetworkCapture.install({
 *   includeHeaders: true,
 *   ignorePatterns: ['/analytics', /\.hot-update\./],
 * });
 *
 * // Later, uninstall if needed
 * NetworkCapture.uninstall();
 * ```
 */
export { NetworkCapture } from './core/network-capture';

/**
 * Configuration type for network capture.
 */
export type { NetworkCaptureConfig } from './core/network-capture';

// ============================================================================
// Timeline API
// ============================================================================

/**
 * Timeline visualization for logs and spans.
 *
 * @example
 * ```typescript
 * // Create a timeline in a container
 * const timeline = createTimeline({
 *   container: '#timeline-container',
 *   timeWindow: 60000, // 1 minute
 *   showSpans: true,
 *   showLogs: true,
 * });
 *
 * // Change time window
 * timeline.setTimeWindow(30000); // 30 seconds
 *
 * // Cleanup
 * timeline.destroy();
 * ```
 */
export { Timeline, createTimeline } from './ui/timeline';

/**
 * Configuration type for timeline.
 */
export type { TimelineConfig } from './ui/timeline';

// ============================================================================
// Diff Utilities
// ============================================================================

/**
 * Diff utility functions for object comparison.
 *
 * @example
 * ```typescript
 * // Log a visual diff
 * logger.diff('Config changed', oldConfig, newConfig);
 *
 * // Compute diff without logging
 * const result = logger.computeDiff(oldObj, newObj);
 * console.log(result.summary); // { added: 2, removed: 1, changed: 3, unchanged: 5 }
 * ```
 */
export { computeDiff, createDiffResult, hasChanges, formatValue } from './core/diff';

/**
 * Diff-related type definitions.
 */
export type { DiffEntry, DiffResult, DiffChangeType } from './core/types';

// ============================================================================
// Package Info
// ============================================================================

/** Current package version */
export const VERSION = '0.1.0';
