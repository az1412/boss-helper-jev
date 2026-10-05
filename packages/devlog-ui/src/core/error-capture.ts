/**
 * Global Error Capture Module
 *
 * Automatically captures uncaught errors and unhandled promise rejections
 * and logs them through the DevLogger system.
 *
 * Features:
 * - window.onerror for synchronous errors
 * - window.onunhandledrejection for promise rejections
 * - Preserves existing handlers (chaining)
 * - Can be enabled/disabled at runtime
 * - Zero-throw policy maintained
 */

import { logger } from './logger';

/** Configuration for error capture */
export interface ErrorCaptureConfig {
  /** Capture synchronous errors via window.onerror */
  captureErrors?: boolean;
  /** Capture unhandled promise rejections */
  captureRejections?: boolean;
  /** Prefix for error messages */
  errorPrefix?: string;
  /** Prefix for rejection messages */
  rejectionPrefix?: string;
}

const DEFAULT_CONFIG: Required<ErrorCaptureConfig> = {
  captureErrors: true,
  captureRejections: true,
  errorPrefix: '[Uncaught Error]',
  rejectionPrefix: '[Unhandled Rejection]',
};

/** Internal state */
let isInstalled = false;
let config: Required<ErrorCaptureConfig> = { ...DEFAULT_CONFIG };

// Store original handlers to restore later and chain calls
let originalOnError: OnErrorEventHandler = null;

// Bound handler reference for removal
let boundRejectionHandler: ((event: PromiseRejectionEvent) => void) | null = null;

/**
 * Handle uncaught errors
 */
function handleError(
  event: Event | string,
  source?: string,
  lineno?: number,
  colno?: number,
  error?: Error
): boolean {
  try {
    // Build error info
    const errorObj = error || (event instanceof ErrorEvent ? event.error : null);
    const message = errorObj?.message || String(event);
    const stack = errorObj?.stack;

    // Log through DevLogger
    logger.error(`${config.errorPrefix} ${message}`, {
      source: source || 'unknown',
      line: lineno || 0,
      column: colno || 0,
      stack,
      originalError: errorObj
        ? {
            name: errorObj.name,
            message: errorObj.message,
            stack: errorObj.stack,
          }
        : undefined,
    });
  } catch {
    // Zero-throw policy - silently fail
  }

  // Chain to original handler if it exists
  if (originalOnError) {
    try {
      return originalOnError(event, source, lineno, colno, error) ?? false;
    } catch {
      // Ignore errors in original handler
    }
  }

  // Return false to allow default browser handling
  return false;
}

/**
 * Handle unhandled promise rejections
 */
function handleRejection(event: PromiseRejectionEvent): void {
  try {
    const reason = event.reason;
    let message: string;
    let errorInfo: Record<string, unknown> = {};

    if (reason instanceof Error) {
      message = reason.message;
      errorInfo = {
        name: reason.name,
        message: reason.message,
        stack: reason.stack,
      };
    } else if (typeof reason === 'string') {
      message = reason;
    } else {
      message = 'Unknown rejection reason';
      errorInfo = { reason };
    }

    // Log through DevLogger
    logger.error(`${config.rejectionPrefix} ${message}`, errorInfo);
  } catch {
    // Zero-throw policy - silently fail
  }
}

/**
 * Install global error handlers
 */
function install(options: ErrorCaptureConfig = {}): void {
  if (isInstalled) {
    // Update config if already installed
    config = { ...config, ...options };
    return;
  }

  try {
    // Check if we're in a browser environment
    if (typeof window === 'undefined') {
      return;
    }

    config = { ...DEFAULT_CONFIG, ...options };

    // Store original error handler
    originalOnError = window.onerror;

    // Install error handler
    if (config.captureErrors) {
      window.onerror = handleError;
    }

    // Install rejection handler using addEventListener for proper event dispatch
    if (config.captureRejections) {
      boundRejectionHandler = handleRejection;
      window.addEventListener('unhandledrejection', boundRejectionHandler);
    }

    isInstalled = true;
  } catch {
    // Zero-throw policy - silently fail
  }
}

/**
 * Uninstall global error handlers and restore originals
 */
function uninstall(): void {
  if (!isInstalled) {
    return;
  }

  try {
    if (typeof window === 'undefined') {
      return;
    }

    // Restore original error handler
    window.onerror = originalOnError;

    // Remove rejection handler
    if (boundRejectionHandler) {
      window.removeEventListener('unhandledrejection', boundRejectionHandler);
    }

    // Reset state
    originalOnError = null;
    boundRejectionHandler = null;
    isInstalled = false;
  } catch {
    // Zero-throw policy - silently fail
  }
}

/**
 * Check if error capture is installed
 */
function isActive(): boolean {
  return isInstalled;
}

/**
 * Get current configuration
 */
function getConfig(): Readonly<Required<ErrorCaptureConfig>> {
  return { ...config };
}

/**
 * Error Capture Public API
 */
export const ErrorCapture = {
  /**
   * Install global error handlers
   *
   * @example
   * ```typescript
   * // Install with defaults
   * ErrorCapture.install();
   *
   * // Install with custom config
   * ErrorCapture.install({
   *   captureErrors: true,
   *   captureRejections: true,
   *   errorPrefix: '[ERROR]',
   * });
   * ```
   */
  install,

  /**
   * Uninstall global error handlers and restore originals
   */
  uninstall,

  /**
   * Check if error capture is currently active
   */
  isActive,

  /**
   * Get current configuration
   */
  getConfig,
};
